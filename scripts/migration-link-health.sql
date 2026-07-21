-- ============================================================
-- link_health_findings — 死链/重定向待处理队列（Admin C3）
--
-- Creates:
--   1. link_health_findings — open findings from check-links CLI
--
-- Apply (manual only; do NOT auto-run against production in C3):
--   Supabase SQL Editor: paste and run this file
--   Supabase CLI with DB URL:
--     supabase db query --db-url "$DATABASE_URL" --file scripts/migration-link-health.sql
--
-- Rollback:
--   DROP INDEX IF EXISTS idx_link_health_findings_link_id;
--   DROP INDEX IF EXISTS idx_link_health_findings_open;
--   DROP TABLE IF EXISTS link_health_findings;
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS link_health_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID REFERENCES nav_links(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  http_status TEXT NOT NULL,
  detail TEXT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('broken', 'redirect')),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ NULL,
  run_id TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_link_health_findings_open
  ON link_health_findings (resolved_at)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_link_health_findings_link_id
  ON link_health_findings (link_id);

-- service_role only — no anon/authenticated policies (same pattern as favorites rate limits)
ALTER TABLE link_health_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE link_health_findings FORCE ROW LEVEL SECURITY;

REVOKE ALL ON link_health_findings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON link_health_findings TO service_role;

COMMENT ON TABLE link_health_findings IS
  'CLI check-links findings queue for Admin; open rows have resolved_at IS NULL; no auto-resolve on recovery';

COMMIT;

-- Verify
SELECT 'link_health_findings table' AS check_name, table_name::text
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'link_health_findings';
