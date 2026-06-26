-- ============================================================
-- 综合导航站 — 完整迁移
-- 安全可重复执行（全部使用 IF NOT EXISTS / DROP IF EXISTS）
-- ============================================================

-- ═══════════════════════════════════════════════
-- PART 1: nav_links.slug 列
-- ═══════════════════════════════════════════════

-- 1.1 新增 slug 列
ALTER TABLE nav_links ADD COLUMN IF NOT EXISTS slug TEXT;

-- 1.2 为已有数据回填 slug
UPDATE nav_links
SET slug = btrim(
  regexp_replace(
    regexp_replace(
      regexp_replace(lower(title), '[^\w一-龥\s-]', '', 'g'),
      '\s+', '-', 'g'
    ),
    '-+', '-', 'g'
  ),
  '-'
)
WHERE slug IS NULL OR slug = '';

-- 1.3 修复重复 slug（添加随机后缀）
UPDATE nav_links
SET slug = slug || '-' || substr(md5(random()::text), 1, 4)
WHERE slug IN (
  SELECT slug FROM nav_links
  WHERE slug IS NOT NULL AND approved = true
  GROUP BY slug
  HAVING count(*) > 1
)
AND id NOT IN (
  SELECT min(id) FROM nav_links
  WHERE slug IS NOT NULL AND approved = true
  GROUP BY slug
  HAVING count(*) > 1
);

-- 1.4 建立唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_nav_links_slug_approved
  ON nav_links (slug)
  WHERE approved = true;

-- 1.5 创建自动维护 trigger
CREATE OR REPLACE FUNCTION auto_generate_slug()
RETURNS TRIGGER AS $$
BEGIN
  NEW.slug = btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(NEW.title), '[^\w一-龥\s-]', '', 'g'),
        '\s+', '-', 'g'
      ),
      '-+', '-', 'g'
    ),
    '-'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_nav_links_auto_slug ON nav_links;
CREATE TRIGGER trg_nav_links_auto_slug
  BEFORE INSERT OR UPDATE OF title ON nav_links
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_slug();

COMMENT ON COLUMN nav_links.slug IS 'URL slug，由 title 自动生成';

-- ═══════════════════════════════════════════════
-- PART 2: user_favorites 表
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  link_id UUID NOT NULL REFERENCES nav_links(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, link_id)
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id
  ON user_favorites(user_id);

ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_select_own_favorites' AND tablename = 'user_favorites') THEN
    CREATE POLICY "users_select_own_favorites"
      ON user_favorites FOR SELECT
      USING (auth.jwt() ->> 'sub' = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_insert_own_favorites' AND tablename = 'user_favorites') THEN
    CREATE POLICY "users_insert_own_favorites"
      ON user_favorites FOR INSERT
      WITH CHECK (auth.jwt() ->> 'sub' = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_delete_own_favorites' AND tablename = 'user_favorites') THEN
    CREATE POLICY "users_delete_own_favorites"
      ON user_favorites FOR DELETE
      USING (auth.jwt() ->> 'sub' = user_id);
  END IF;
END $$;

-- ═══════════════════════════════════════════════
-- 验证
-- ═══════════════════════════════════════════════

SELECT 'slug column' AS check_name, column_name FROM information_schema.columns
  WHERE table_name='nav_links' AND column_name='slug'
UNION ALL
SELECT 'slug index' AS check_name, indexname::text FROM pg_indexes
  WHERE indexname = 'idx_nav_links_slug_approved'
UNION ALL
SELECT 'trigger' AS check_name, trigger_name::text FROM information_schema.triggers
  WHERE event_object_table='nav_links' AND trigger_name='trg_nav_links_auto_slug'
UNION ALL
SELECT 'user_favorites table' AS check_name, table_name::text FROM information_schema.tables
  WHERE table_schema='public' AND table_name='user_favorites';
