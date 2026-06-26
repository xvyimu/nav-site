-- ============================================================
-- nav_links.slug 列迁移 — 为程序化 SEO 详情页添加数据库级 slug 查询
--
-- 使用方法：
--   在 Supabase SQL Editor 中运行此脚本
--
-- 背景：
--   /tool/[slug] 页面通过 slugify(title) 生成 URL slug，
--   原先在应用层全表扫描后内存匹配，200+ 条数据时成为性能瓶颈。
--   此迁移在 nav_links 表新增 slug 列并建立唯一索引，
--   使 getApprovedLinkBySlug 可直接 .eq("slug", slug) 查询。
-- ============================================================

-- 1. 新增 slug 列（可为空，兼容已有数据）
ALTER TABLE nav_links ADD COLUMN IF NOT EXISTS slug TEXT;

-- 2. 为已有数据回填 slug
--    slug 规则与 lib/slugify.ts 保持一致：
--    小写 → 去除特殊字符（保留字母数字中文空格连字符）→ 空格转连字符 → 合并连续连字符
UPDATE nav_links
SET slug = (
  SELECT
    btrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            lower(title),
            '[^\w\u4e00-\u9fa5\s-]', '', 'g'
          ),
          '\s+', '-', 'g'
        ),
        '-+', '-', 'g'
      ),
      '-'
    )
)
WHERE slug IS NULL OR slug = '';

-- 3. 建立唯一索引（同一 slug 只能对应一条已批准链接）
CREATE UNIQUE INDEX IF NOT EXISTS idx_nav_links_slug_approved
  ON nav_links (slug)
  WHERE approved = true;

-- 4. 创建自动维护 trigger — INSERT/UPDATE title 时自动生成 slug
CREATE OR REPLACE FUNCTION auto_generate_slug()
RETURNS TRIGGER AS $$
BEGIN
  NEW.slug = btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(NEW.title),
          '[^\w\u4e00-\u9fa5\s-]', '', 'g'
        ),
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

-- 5. 注释
COMMENT ON COLUMN nav_links.slug IS 'URL slug，由 title 自动生成，用于 /tool/[slug] 详情页';
