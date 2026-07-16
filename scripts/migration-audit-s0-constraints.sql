-- ============================================================
-- Audit S0/S3 production constraints (2026-07-13)
-- Safe to rerun where possible (IF NOT EXISTS / CREATE OR REPLACE).
-- Execute in the production Supabase SQL Editor after taking a backup.
--
-- App dependencies:
--   1. lib/rate-limit.ts::tryRecordClick requires click_rate_limits and
--      UNIQUE(ip, url, window_start) for atomic click de-duplication.
--   2. lib/repositories/submissions.ts::submitLink requires UNIQUE(nav_links.url)
--      so duplicate concurrent submissions become 23505 -> HTTP 409.
--   3. lib/search/semantic.ts can use search_links_semantic_v2 when
--      EMBED_PROVIDER=cloudflare and EMBED_SEMANTIC_RPC=search_links_semantic_v2.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE nav_links ADD COLUMN IF NOT EXISTS embedding vector(512);

-- ============================================================
-- PART 1: click_rate_limits table (click de-duplication / rate limiting)
-- ============================================================

CREATE TABLE IF NOT EXISTS click_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip TEXT NOT NULL,
  url TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_click_rate_limits_ip_url_window
  ON click_rate_limits (ip, url, window_start);

CREATE INDEX IF NOT EXISTS idx_click_rate_limits_created_at
  ON click_rate_limits (created_at);

ALTER TABLE click_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE click_rate_limits FORCE ROW LEVEL SECURITY;

REVOKE ALL ON click_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON click_rate_limits TO service_role;

DROP POLICY IF EXISTS "Anyone can insert click rate limits" ON click_rate_limits;
CREATE POLICY "Anyone can insert click rate limits"
  ON click_rate_limits FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage click rate limits" ON click_rate_limits;
CREATE POLICY "Service role can manage click rate limits"
  ON click_rate_limits FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE click_rate_limits IS 'Click de-duplication / IP rate limiting by fixed window';

-- Generic atomic quota buckets for login, submit, favorites, reviews, and ratings.
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  current_count INTEGER NOT NULL CHECK (current_count > 0),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (bucket_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_expires_at
  ON rate_limit_buckets (expires_at);

ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_buckets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON rate_limit_buckets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limit_buckets TO service_role;

DROP POLICY IF EXISTS "Service role can manage atomic rate limits" ON rate_limit_buckets;
CREATE POLICY "Service role can manage atomic rate limits"
  ON rate_limit_buckets FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION consume_rate_limit(
  p_bucket_key TEXT,
  p_window_seconds INTEGER,
  p_max_attempts INTEGER
)
RETURNS TABLE (allowed BOOLEAN, current_count INTEGER)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  bucket_start TIMESTAMPTZ;
  consumed_count INTEGER;
BEGIN
  IF p_bucket_key IS NULL OR length(p_bucket_key) = 0 OR length(p_bucket_key) > 300 THEN
    RAISE EXCEPTION 'invalid rate-limit bucket key';
  END IF;
  IF p_window_seconds < 1 OR p_max_attempts < 1 THEN
    RAISE EXCEPTION 'rate-limit window and maximum must be positive';
  END IF;

  bucket_start := to_timestamp(
    floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO rate_limit_buckets (bucket_key, window_start, current_count, expires_at)
  VALUES (
    p_bucket_key,
    bucket_start,
    1,
    bucket_start + make_interval(secs => p_window_seconds * 2)
  )
  ON CONFLICT (bucket_key, window_start)
  DO UPDATE SET current_count = rate_limit_buckets.current_count + 1
  RETURNING rate_limit_buckets.current_count INTO consumed_count;

  DELETE FROM rate_limit_buckets
  WHERE bucket_key = p_bucket_key
    AND expires_at < clock_timestamp();

  RETURN QUERY SELECT consumed_count <= p_max_attempts, consumed_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION consume_rate_limit(TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION consume_rate_limit(TEXT, INTEGER, INTEGER)
  TO service_role;

COMMENT ON FUNCTION consume_rate_limit(TEXT, INTEGER, INTEGER)
  IS 'Atomically consume one fixed-window rate-limit quota unit';

-- ============================================================
-- PART 2: nav_links.url uniqueness (submission de-duplication)
-- ============================================================

-- Do not delete production rows from a migration. If duplicates exist, stop and
-- resolve them manually before creating the unique index.
DO $$
DECLARE
  duplicate_url_count INTEGER;
BEGIN
  SELECT count(*)
  INTO duplicate_url_count
  FROM (
    SELECT url
    FROM nav_links
    WHERE url IS NOT NULL
    GROUP BY url
    HAVING count(*) > 1
  ) duplicates;

  IF duplicate_url_count > 0 THEN
    RAISE EXCEPTION 'nav_links contains % duplicate URL group(s); resolve duplicates before creating idx_nav_links_url_unique', duplicate_url_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_nav_links_url_unique
  ON nav_links (url);

COMMENT ON INDEX idx_nav_links_url_unique IS 'Submission de-duplication: URL is globally unique; submitLink maps 23505 to 409';

-- ============================================================
-- PART 3: filtered public tools query
-- ============================================================

CREATE OR REPLACE FUNCTION list_public_tools(
  p_category_slug TEXT DEFAULT NULL,
  p_ids UUID[] DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  slug TEXT,
  url TEXT,
  description TEXT,
  icon TEXT,
  category_id UUID,
  approved BOOLEAN,
  paid BOOLEAN,
  featured BOOLEAN,
  click_count INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  category_name TEXT,
  category_slug TEXT,
  total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH filtered AS (
    SELECT
      nl.id,
      nl.title,
      nl.slug,
      nl.url,
      nl.description,
      nl.icon,
      nl.category_id,
      nl.approved,
      nl.paid,
      nl.featured,
      nl.click_count,
      nl.created_at,
      nl.updated_at,
      nc.name AS category_name,
      nc.slug AS category_slug
    FROM public.nav_links AS nl
    LEFT JOIN public.nav_categories AS nc ON nc.id = nl.category_id
    WHERE nl.approved = true
      AND (p_category_slug IS NULL OR nc.slug = p_category_slug)
      AND (p_ids IS NULL OR nl.id = ANY(p_ids))
      AND (
        p_search IS NULL
        OR btrim(p_search) = ''
        OR nl.title ILIKE '%' || p_search || '%'
        OR coalesce(nl.description, '') ILIKE '%' || p_search || '%'
        OR coalesce(nc.name, '') ILIKE '%' || p_search || '%'
      )
  )
  SELECT
    filtered.*,
    COUNT(*) OVER() AS total_count
  FROM filtered
  ORDER BY featured DESC, created_at DESC, id ASC
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

REVOKE ALL ON FUNCTION list_public_tools(TEXT, UUID[], TEXT, INTEGER)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_public_tools(TEXT, UUID[], TEXT, INTEGER) TO anon, authenticated, service_role;

COMMENT ON FUNCTION list_public_tools(TEXT, UUID[], TEXT, INTEGER)
  IS 'Filtered public tools projection with pre-limit total count; excludes embedding columns';

-- ============================================================
-- PART 4: 512-d compatibility batch writer
-- ============================================================

CREATE OR REPLACE FUNCTION batch_update_embeddings(embeddings jsonb)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  item jsonb;
  updated_count INTEGER := 0;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(embeddings)
  LOOP
    UPDATE public.nav_links
    SET embedding = (item->>'embedding')::public.vector(512)
    WHERE id = (item->>'link_id')::uuid;

    IF FOUND THEN
      updated_count := updated_count + 1;
    END IF;
  END LOOP;

  RETURN updated_count;
END;
$$;

COMMENT ON FUNCTION batch_update_embeddings(jsonb) IS 'Batch write 512-d embeddings into nav_links.embedding';
REVOKE EXECUTE ON FUNCTION batch_update_embeddings(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION batch_update_embeddings(jsonb) TO service_role;

-- ============================================================
-- PART 5: Cloudflare Workers AI 1024-d semantic search path
-- ============================================================

ALTER TABLE nav_links ADD COLUMN IF NOT EXISTS embedding_1024 vector(1024);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS index_class
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = index_class.relnamespace
    JOIN pg_catalog.pg_am AS access_method
      ON access_method.oid = index_class.relam
    WHERE namespace.nspname = 'public'
      AND index_class.relname = 'idx_nav_links_embedding_1024'
      AND access_method.amname <> 'hnsw'
  ) THEN
    DROP INDEX public.idx_nav_links_embedding_1024;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_nav_links_embedding_1024
  ON nav_links
  USING hnsw (embedding_1024 vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE OR REPLACE FUNCTION search_links_semantic_v2(
  query_embedding vector(1024),
  match_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  url TEXT,
  description TEXT,
  icon TEXT,
  category_name TEXT,
  category_slug TEXT,
  similarity FLOAT,
  featured BOOLEAN,
  paid BOOLEAN,
  click_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    nl.id,
    nl.title,
    nl.url,
    nl.description,
    nl.icon,
    nc.name AS category_name,
    nc.slug AS category_slug,
    1 - (nl.embedding_1024 <=> query_embedding) AS similarity,
    nl.featured,
    nl.paid,
    nl.click_count
  FROM public.nav_links nl
  LEFT JOIN public.nav_categories nc ON nc.id = nl.category_id
  WHERE nl.approved = true
    AND nl.embedding_1024 IS NOT NULL
  ORDER BY nl.embedding_1024 <=> query_embedding
  LIMIT match_count;
$$;

REVOKE EXECUTE ON FUNCTION search_links_semantic_v2(vector, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION search_links_semantic_v2(vector, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION update_link_embedding_v2(
  link_id UUID,
  new_embedding vector(1024)
)
RETURNS VOID
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  UPDATE public.nav_links
  SET embedding_1024 = new_embedding
  WHERE id = link_id;
$$;

CREATE OR REPLACE FUNCTION batch_update_embeddings_v2(embeddings jsonb)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  item jsonb;
  updated_count INTEGER := 0;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(embeddings)
  LOOP
    UPDATE public.nav_links
    SET embedding_1024 = (item->>'embedding')::public.vector(1024)
    WHERE id = (item->>'link_id')::uuid;

    IF FOUND THEN
      updated_count := updated_count + 1;
    END IF;
  END LOOP;

  RETURN updated_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_link_embedding_v2(UUID, vector) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION update_link_embedding_v2(UUID, vector) TO service_role;
REVOKE EXECUTE ON FUNCTION batch_update_embeddings_v2(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION batch_update_embeddings_v2(jsonb) TO service_role;

COMMENT ON COLUMN nav_links.embedding_1024 IS 'Cloudflare Workers AI @cf/baai/bge-m3 vector embedding for nav semantic search';
COMMENT ON FUNCTION search_links_semantic_v2 IS '1024-d vector similarity search for Cloudflare Workers AI embeddings';
COMMENT ON FUNCTION update_link_embedding_v2 IS 'Update a single 1024-d nav_links embedding';
COMMENT ON FUNCTION batch_update_embeddings_v2(jsonb) IS 'Batch write 1024-d embeddings into nav_links.embedding_1024';

-- ============================================================
-- PART 6: verification output
-- ============================================================

SELECT 'click_rate_limits table' AS check_name, table_name::text AS detail
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'click_rate_limits'
UNION ALL
SELECT 'click_rate_limits unique idx', indexname::text
  FROM pg_indexes
  WHERE tablename = 'click_rate_limits' AND indexname = 'idx_click_rate_limits_ip_url_window'
UNION ALL
SELECT 'rate_limit_buckets table', table_name::text
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'rate_limit_buckets'
UNION ALL
SELECT 'consume_rate_limit function', routine_name::text
  FROM information_schema.routines
  WHERE routine_schema = 'public' AND routine_name = 'consume_rate_limit'
UNION ALL
SELECT 'list_public_tools function', routine_name::text
  FROM information_schema.routines
  WHERE routine_schema = 'public' AND routine_name = 'list_public_tools'
UNION ALL
SELECT 'nav_links url unique idx', indexname::text
  FROM pg_indexes
  WHERE tablename = 'nav_links' AND indexname = 'idx_nav_links_url_unique'
UNION ALL
SELECT 'nav_links embedding_1024 column', column_name::text
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'nav_links' AND column_name = 'embedding_1024'
UNION ALL
SELECT 'nav_links embedding_1024 idx', indexname::text
  FROM pg_indexes
  WHERE tablename = 'nav_links' AND indexname = 'idx_nav_links_embedding_1024'
UNION ALL
SELECT 'search_links_semantic_v2 function', routine_name::text
  FROM information_schema.routines
  WHERE routine_schema = 'public' AND routine_name = 'search_links_semantic_v2'
UNION ALL
SELECT 'batch_update_embeddings_v2 function', routine_name::text
  FROM information_schema.routines
  WHERE routine_schema = 'public' AND routine_name = 'batch_update_embeddings_v2';
