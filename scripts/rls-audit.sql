-- ============================================================
-- RLS 策略审计脚本
-- 用于评估双库合并（方案 A）的安全性
--
-- 使用方法：
--   在 Supabase SQL Editor 中运行此脚本
--   检查输出结果，确认 RLS 策略符合单库模式要求
-- ============================================================

-- 1. 检查所有表的 RLS 启用状态
SELECT
  schemaname AS schema,
  tablename AS table_name,
  rowsecurity AS rls_enabled,
  forcerowsecurity AS rls_forced
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2. 列出所有 RLS 策略
SELECT
  schemaname AS schema,
  tablename AS table_name,
  policyname AS policy_name,
  permissive,
  roles,
  cmd AS command,
  qual AS using_clause,
  with_check AS check_clause
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 3. 检查 anon 角色对各表的写入权限
-- 预期：anon 只能写入 submit_attempts, login_attempts, click_rate_limits
-- 预期：anon 不能写入 nav_links, nav_categories, model_rankings
SELECT
  tablename AS table_name,
  CASE
    WHEN has_table_privilege('anon', schemaname || '.' || tablename, 'INSERT') THEN 'YES'
    ELSE 'NO'
  END AS anon_can_insert,
  CASE
    WHEN has_table_privilege('anon', schemaname || '.' || tablename, 'UPDATE') THEN 'YES'
    ELSE 'NO'
  END AS anon_can_update,
  CASE
    WHEN has_table_privilege('anon', schemaname || '.' || tablename, 'DELETE') THEN 'YES'
    ELSE 'NO'
  END AS anon_can_delete
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 4. 检查 nav_links 表的策略（关键表）
-- 预期策略：
--   - anon SELECT approved = true 的链接
--   - authenticated (admin) 可以 SELECT/INSERT/UPDATE/DELETE 所有链接
SELECT
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'nav_links'
ORDER BY policyname;

-- 5. 检查 nav_categories 表的策略
SELECT
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'nav_categories'
ORDER BY policyname;

-- 6. 检查 model_rankings 表的策略
SELECT
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'model_rankings'
ORDER BY policyname;

-- 7. 检查速率限制表是否允许 anon 写入
SELECT
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('submit_attempts', 'login_attempts', 'click_rate_limits')
ORDER BY tablename, policyname;

-- 8. 数据量统计（用于迁移前后的一致性校验）
SELECT 'nav_categories' AS table_name, count(*) AS row_count FROM nav_categories
UNION ALL
SELECT 'nav_links', count(*) FROM nav_links
UNION ALL
SELECT 'nav_links_approved', count(*) FROM nav_links WHERE approved = true
UNION ALL
SELECT 'model_rankings', count(*) FROM model_rankings
UNION ALL
SELECT 'submit_attempts', count(*) FROM submit_attempts
UNION ALL
SELECT 'click_rate_limits', count(*) FROM click_rate_limits;

-- ============================================================
-- 审计结论模板
--
-- [ ] 所有业务表（nav_links, nav_categories, model_rankings）已启用 RLS
-- [ ] anon 角色无法 INSERT/UPDATE/DELETE 业务表
-- [ ] anon 角色只能 SELECT approved = true 的 nav_links
-- [ ] anon 角色可以 INSERT 速率限制表（submit_attempts 等）
-- [ ] authenticated (admin) 角色有完整的 CRUD 权限
-- [ ] RLS 策略为 FORCED（防止管理员遗漏）
--
-- 如以上全部通过，可安全执行双库合并。
-- ============================================================
