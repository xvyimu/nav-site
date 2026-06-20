-- =============================================
-- 生产库修复：管理员权限 + 清理 affiliate 链接
-- 在 https://supabase.com/dashboard/project/vyqqbypwrbdcafanzwmj/sql/new 执行
-- =============================================

-- 1. 清理所有 aff 推广参数
UPDATE nav_links SET url = regexp_replace(url, '\?aff=[A-Za-z0-9]+', '', 'g') WHERE url ~ '\?aff=';

-- 2. 管理员 RLS 权限
DROP POLICY IF EXISTS "Anon update links" ON nav_links;
DROP POLICY IF EXISTS "Anon delete links" ON nav_links;
DROP POLICY IF EXISTS "Anon insert categories" ON nav_categories;
DROP POLICY IF EXISTS "Anon update categories" ON nav_categories;
DROP POLICY IF EXISTS "Anon delete categories" ON nav_categories;

CREATE POLICY "Anon update links" ON nav_links FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anon delete links" ON nav_links FOR DELETE USING (true);
CREATE POLICY "Anon insert categories" ON nav_categories FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon update categories" ON nav_categories FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anon delete categories" ON nav_categories FOR DELETE USING (true);
