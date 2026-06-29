-- ──────────────────────────────────────────────
-- favorites_rate_limits 表 — 收藏操作 IP 级速率限制
-- 在 Supabase SQL Editor 中执行（可重复执行）
-- ──────────────────────────────────────────────

-- 1. 表结构：与 submit_attempts / review_rate_limits 同构
CREATE TABLE IF NOT EXISTS favorites_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. 索引：按 IP + 时间窗口查询
CREATE INDEX IF NOT EXISTS idx_favorites_rate_limits_ip
  ON favorites_rate_limits(ip);

CREATE INDEX IF NOT EXISTS idx_favorites_rate_limits_created_at
  ON favorites_rate_limits(created_at);

CREATE INDEX IF NOT EXISTS idx_favorites_rate_limits_ip_created_at
  ON favorites_rate_limits(ip, created_at DESC);

-- 3. RLS：anon/authenticated 只能 INSERT（用于记录尝试），service_role 可清理
ALTER TABLE favorites_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites_rate_limits FORCE ROW LEVEL SECURITY;

REVOKE ALL ON favorites_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON favorites_rate_limits TO service_role;

-- 允许 anon/authenticated INSERT（rate-limit 记录场景），但禁止 SELECT/UPDATE/DELETE
DROP POLICY IF EXISTS "Anyone can insert favorites rate limits" ON favorites_rate_limits;
CREATE POLICY "Anyone can insert favorites rate limits"
  ON favorites_rate_limits FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

COMMENT ON TABLE favorites_rate_limits IS '收藏操作的 IP 级速率限制记录（每 15 分钟窗口去重）';

-- 4. 验证
SELECT 'favorites_rate_limits table' AS check_name, table_name::text
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'favorites_rate_limits';
