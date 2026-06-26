-- ============================================================
-- 分类层级 — 数据库迁移脚本
--
-- 使用方法：
--   在 Supabase SQL Editor 中运行此脚本
--
-- 作用：
--   为 nav_categories 表添加 parent_id 列，支持父/子分类层级。
--   - parent_id 为 NULL：顶级分类（现有所有分类保持顶级）
--   - parent_id 非 NULL：子分类，指向父分类的 id
--   - ON DELETE SET NULL：父分类被删除时，子分类自动变为顶级
--
-- 前台行为：
--   - 侧边栏渲染可折叠树形结构
--   - 选中父分类时，聚合显示该分类及其所有子分类的链接
--   - 选中子分类时，仅显示该子分类的链接
-- ============================================================

-- 1. 添加 parent_id 列（可空，自引用外键）
ALTER TABLE nav_categories
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES nav_categories(id) ON DELETE SET NULL;

-- 2. 索引：加速按父分类查询子分类
CREATE INDEX IF NOT EXISTS idx_nav_categories_parent_id
  ON nav_categories(parent_id)
  WHERE parent_id IS NOT NULL;

-- 3. 注释
COMMENT ON COLUMN nav_categories.parent_id IS '父分类 ID（NULL = 顶级分类）。选中父分类时聚合所有子分类的链接';

-- 注意：此迁移不修改现有数据。
-- 所有现有分类的 parent_id 默认为 NULL（顶级分类）。
-- 如需创建子分类，可在 admin 后台通过 API 设置 parent_id。
