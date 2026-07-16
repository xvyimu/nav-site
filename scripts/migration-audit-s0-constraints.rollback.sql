-- ============================================================
-- Non-destructive rollback for migration-audit-s0-constraints.sql
-- ============================================================
-- Run only after rolling application code back to a revision that does not
-- call these functions. This script intentionally preserves tables, columns,
-- rate-limit history, and embedding data so a forward re-apply is lossless.
-- Review against the target database before execution.

BEGIN;

DROP FUNCTION IF EXISTS list_public_tools(TEXT, UUID[], TEXT, INTEGER);
DROP FUNCTION IF EXISTS consume_rate_limit(TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS search_links_semantic_v2(vector, INTEGER);
DROP FUNCTION IF EXISTS update_link_embedding_v2(UUID, vector);
DROP FUNCTION IF EXISTS batch_update_embeddings_v2(JSONB);
DROP FUNCTION IF EXISTS batch_update_embeddings(JSONB);

DROP INDEX IF EXISTS idx_nav_links_embedding_1024;
DROP INDEX IF EXISTS idx_nav_links_url_unique;

COMMIT;

-- Deliberately retained:
--   nav_links.embedding / nav_links.embedding_1024
--   click_rate_limits / rate_limit_buckets and their data
-- Remove them only in a separately reviewed destructive migration.
