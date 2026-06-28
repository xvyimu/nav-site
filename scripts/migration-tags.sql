-- ============================================================
-- 标签系统 — 数据库迁移脚本
--
-- 使用方法：
--   在 Supabase SQL Editor 中运行此脚本
--
-- 创建表：
--   1. tags — 标签字典（name + slug 唯一）
--   2. nav_links_tags — 链接与标签的多对多关联
--
-- 使用场景：
--   前台支持多标签交叉过滤（AND 语义：选中多个标签时，
--   只展示同时拥有全部所选标签的链接）
-- ============================================================

-- 1. 标签字典表
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name),
  UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug);

-- 2. 链接-标签关联表（多对多）
CREATE TABLE IF NOT EXISTS nav_links_tags (
  link_id UUID NOT NULL REFERENCES nav_links(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (link_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_nav_links_tags_link_id ON nav_links_tags(link_id);
CREATE INDEX IF NOT EXISTS idx_nav_links_tags_tag_id ON nav_links_tags(tag_id);

-- 3. RLS 策略
-- tags: 所有人可读，仅服务端（service_role）可写
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tags' AND policyname = 'Anyone can read tags'
  ) THEN
    CREATE POLICY "Anyone can read tags"
      ON tags FOR SELECT
      USING (true);
  END IF;
END $$;

GRANT SELECT ON tags TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON tags TO service_role;

-- nav_links_tags: 所有人可读（前台需展示标签），仅 service_role 可写
ALTER TABLE nav_links_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE nav_links_tags FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'nav_links_tags' AND policyname = 'Anyone can read link-tag associations'
  ) THEN
    CREATE POLICY "Anyone can read link-tag associations"
      ON nav_links_tags FOR SELECT
      USING (true);
  END IF;
END $$;

GRANT SELECT ON nav_links_tags TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON nav_links_tags TO service_role;

-- 4. 注释
COMMENT ON TABLE tags IS '标签字典，用于链接的多标签分类';
COMMENT ON TABLE nav_links_tags IS '链接与标签的多对多关联表';
COMMENT ON COLUMN tags.slug IS 'URL 友好的 slug，用于前端筛选';

-- 5. 种子数据（常用标签，可按需调整）
INSERT INTO tags (name, slug) VALUES
  ('免费', 'free'),
  ('开源', 'open-source'),
  ('需登录', 'require-login'),
  ('API', 'api'),
  ('中文友好', 'chinese-friendly')
ON CONFLICT (name) DO NOTHING;
