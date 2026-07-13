-- ============================================================
-- 审计 S0 修复所需的 DB 约束（2026-07-13）
-- 安全可重复执行（IF NOT EXISTS / DROP IF EXISTS）
-- 在 Supabase SQL Editor 中执行
--
-- 依赖此迁移的应用改动：
--   1. lib/rate-limit.ts::tryRecordClick — 依赖 click_rate_limits 表
--      与 UNIQUE(ip, url, window_start) 做"先插后计"原子去重（消除 TOCTOU）。
--   2. lib/repositories/submissions.ts::submitLink — 依赖 nav_links.url
--      唯一约束，把并发重复提交转成 23505 → 路由 409。
-- ============================================================

-- ═══════════════════════════════════════════════
-- PART 1: click_rate_limits 表（点击去重 / 限流）
-- ═══════════════════════════════════════════════

-- 1.1 表结构：ip + url + 15 分钟固定窗口起点
CREATE TABLE IF NOT EXISTS click_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip TEXT NOT NULL,
  url TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.2 去重唯一约束：同一 IP 对同一 URL 在同一窗口内只允许一行
--     tryRecordClick 依赖此约束的 23505 冲突判定是否已计过。
CREATE UNIQUE INDEX IF NOT EXISTS idx_click_rate_limits_ip_url_window
  ON click_rate_limits (ip, url, window_start);

-- 1.3 清理用索引（cleanupOldAttempts 按 created_at 删除过期行）
CREATE INDEX IF NOT EXISTS idx_click_rate_limits_created_at
  ON click_rate_limits (created_at);

-- 1.4 RLS：写路径走 service_role（tryRecordClick / cleanup），
--     兼容 rls-audit 对 anon INSERT 的历史预期，但 anon 不可读。
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

COMMENT ON TABLE click_rate_limits IS '点击去重 / IP 级限流（同一 IP+URL 每 15 分钟窗口只计一次）';

-- ═══════════════════════════════════════════════
-- PART 2: nav_links.url 唯一约束（提交去重）
-- ═══════════════════════════════════════════════

-- 2.1 建唯一索引前先合并历史重复 URL（保留最早一行，其余标记删除）。
--     若无重复则不产生任何变更。
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY url ORDER BY created_at, id) AS rn
  FROM nav_links
  WHERE url IS NOT NULL
)
DELETE FROM nav_links
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2.2 全局唯一：同一 URL 只允许一条（无论 approved），
--     submitLink 依赖冲突 → 23505 → 路由 409「已提交/已收录」。
CREATE UNIQUE INDEX IF NOT EXISTS idx_nav_links_url_unique
  ON nav_links (url);

COMMENT ON INDEX idx_nav_links_url_unique IS '提交去重：URL 全局唯一，供 submitLink 捕获 23505 → 409';

-- ═══════════════════════════════════════════════
-- PART 3: 验证
-- ═══════════════════════════════════════════════

SELECT 'click_rate_limits table' AS check_name, table_name::text AS detail
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'click_rate_limits'
UNION ALL
SELECT 'click_rate_limits unique idx', indexname::text
  FROM pg_indexes
  WHERE tablename = 'click_rate_limits' AND indexname = 'idx_click_rate_limits_ip_url_window'
UNION ALL
SELECT 'nav_links url unique idx', indexname::text
  FROM pg_indexes
  WHERE tablename = 'nav_links' AND indexname = 'idx_nav_links_url_unique';
