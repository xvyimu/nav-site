-- ============================================================
-- User reviews migration
--
-- Creates:
--   1. tool_reviews         - ratings and comments for approved tools
--   2. review_rate_limits   - per-IP review throttling records
--   3. tool_review_stats    - aggregate rating view
--
-- Apply:
--   Supabase SQL Editor: paste and run this file
--   Supabase CLI with DB URL:
--     supabase db query --db-url "$DATABASE_URL" --file scripts/migration-reviews.sql
--
-- Rollback:
--   DROP VIEW IF EXISTS tool_review_stats;
--   DROP TRIGGER IF EXISTS trg_tool_reviews_updated_at ON tool_reviews;
--   DROP POLICY IF EXISTS "Anyone can read approved reviews" ON tool_reviews;
--   DROP POLICY IF EXISTS "Anyone can submit reviews" ON tool_reviews;
--   DROP POLICY IF EXISTS "Admin can manage reviews" ON tool_reviews;
--   DROP POLICY IF EXISTS "Admin can delete reviews" ON tool_reviews;
--   DROP POLICY IF EXISTS "Anyone can insert review rate limits" ON review_rate_limits;
--   DROP POLICY IF EXISTS "Anyone can read review rate limits" ON review_rate_limits;
--   DROP TABLE IF EXISTS review_rate_limits;
--   DROP TABLE IF EXISTS tool_reviews;
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS tool_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID NOT NULL REFERENCES nav_links(id) ON DELETE CASCADE,
  ip TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  approved BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tool_reviews_link_id
  ON tool_reviews(link_id);

CREATE INDEX IF NOT EXISTS idx_tool_reviews_approved
  ON tool_reviews(approved);

CREATE INDEX IF NOT EXISTS idx_tool_reviews_created_at
  ON tool_reviews(created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tool_reviews_link_ip_unique
  ON tool_reviews(link_id, ip);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tool_reviews_updated_at ON tool_reviews;
CREATE TRIGGER trg_tool_reviews_updated_at
  BEFORE UPDATE ON tool_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS review_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip TEXT NOT NULL,
  link_id UUID NOT NULL REFERENCES nav_links(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_rate_limits_ip
  ON review_rate_limits(ip);

CREATE INDEX IF NOT EXISTS idx_review_rate_limits_created_at
  ON review_rate_limits(created_at);

CREATE INDEX IF NOT EXISTS idx_review_rate_limits_ip_created_at
  ON review_rate_limits(ip, created_at DESC);

ALTER TABLE tool_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_reviews FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read approved reviews" ON tool_reviews;
CREATE POLICY "Anyone can read approved reviews"
  ON tool_reviews FOR SELECT
  USING (approved = true);

DROP POLICY IF EXISTS "Anyone can submit reviews" ON tool_reviews;
CREATE POLICY "Anyone can submit reviews"
  ON tool_reviews FOR INSERT
  WITH CHECK (
    rating >= 1
    AND rating <= 5
    AND length(coalesce(comment, '')) <= 500
  );

-- Admin policies are intentionally tied to an optional profiles table.
-- If the table is absent, these policies are skipped.
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admin can manage reviews" ON tool_reviews';
    EXECUTE 'CREATE POLICY "Admin can manage reviews"
      ON tool_reviews FOR UPDATE
      USING (
        auth.role() = ''authenticated''
        AND EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid()
          AND role = ''admin''
        )
      )';

    EXECUTE 'DROP POLICY IF EXISTS "Admin can delete reviews" ON tool_reviews';
    EXECUTE 'CREATE POLICY "Admin can delete reviews"
      ON tool_reviews FOR DELETE
      USING (
        auth.role() = ''authenticated''
        AND EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid()
          AND role = ''admin''
        )
      )';
  END IF;
END;
$$;

ALTER TABLE review_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_rate_limits FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert review rate limits" ON review_rate_limits;
CREATE POLICY "Anyone can insert review rate limits"
  ON review_rate_limits FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can read review rate limits" ON review_rate_limits;
CREATE POLICY "Anyone can read review rate limits"
  ON review_rate_limits FOR SELECT
  USING (true);

CREATE OR REPLACE VIEW tool_review_stats AS
SELECT
  link_id,
  COUNT(*)::INTEGER AS review_count,
  COALESCE(ROUND(AVG(rating), 1), 0)::FLOAT AS avg_rating,
  COUNT(*) FILTER (WHERE rating = 5)::INTEGER AS five_star_count,
  COUNT(*) FILTER (WHERE rating = 4)::INTEGER AS four_star_count,
  COUNT(*) FILTER (WHERE rating = 3)::INTEGER AS three_star_count,
  COUNT(*) FILTER (WHERE rating = 2)::INTEGER AS two_star_count,
  COUNT(*) FILTER (WHERE rating = 1)::INTEGER AS one_star_count
FROM tool_reviews
WHERE approved = true
GROUP BY link_id;

COMMENT ON TABLE tool_reviews IS 'User reviews for AI tools.';
COMMENT ON COLUMN tool_reviews.rating IS 'Rating from 1 to 5.';
COMMENT ON COLUMN tool_reviews.comment IS 'Optional review text.';
COMMENT ON COLUMN tool_reviews.approved IS 'Whether the review is approved for public display.';
COMMENT ON TABLE review_rate_limits IS 'Review rate-limit attempt records.';
COMMENT ON VIEW tool_review_stats IS 'Aggregate rating statistics per tool.';

COMMIT;
