-- ============================================================
-- pgvector 语义搜索 — 数据库迁移脚本
--
-- 前提条件：
--   在 Supabase Dashboard > Database > Extensions 中启用 vector 扩展
--
-- 使用方法：
--   在 Supabase SQL Editor 中运行此脚本
-- ============================================================

-- 1. 启用 pgvector 扩展（如未启用）
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 为 nav_links 添加 embedding 列（512 维，适配大多数嵌入模型）
ALTER TABLE nav_links ADD COLUMN IF NOT EXISTS embedding vector(512);

-- 3. 创建 IVFFlat 索引加速向量检索
-- lists 参数建议：rows / 1000（最少 10）
-- 此处使用 100 作为默认值，数据量大时需调整
CREATE INDEX IF NOT EXISTS idx_nav_links_embedding
  ON nav_links
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 4. 创建语义搜索函数
-- 输入：查询向量 + 结果数量
-- 输出：匹配的链接（按相似度排序）
CREATE OR REPLACE FUNCTION search_links_semantic(
  query_embedding vector(512),
  match_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  url TEXT,
  description TEXT,
  icon TEXT,
  category_id UUID,
  similarity FLOAT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    nl.id,
    nl.title,
    nl.url,
    nl.description,
    nl.icon,
    nl.category_id,
    1 - (nl.embedding <=> query_embedding) AS similarity
  FROM nav_links nl
  WHERE nl.approved = true
    AND nl.embedding IS NOT NULL
  ORDER BY nl.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- 5. 创建嵌入更新函数（用于在工具标题/描述变更时更新嵌入）
-- 注意：此函数需要调用外部嵌入 API，实际使用时需通过 Edge Function 或应用层实现
-- 此处仅创建占位符，实际嵌入生成在应用层完成
CREATE OR REPLACE FUNCTION update_link_embedding(
  link_id UUID,
  new_embedding vector(512)
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE nav_links
  SET embedding = new_embedding
  WHERE id = link_id;
$$;

-- 6. 注释
COMMENT ON COLUMN nav_links.embedding IS '工具标题+描述的向量嵌入，用于语义搜索（512 维）';
COMMENT ON FUNCTION search_links_semantic IS '基于向量相似度搜索已批准的工具';
COMMENT ON FUNCTION update_link_embedding IS '更新工具的向量嵌入（由应用层调用）';

-- ============================================================
-- 使用说明：
--
-- 1. 在应用层生成嵌入向量（使用 OpenAI text-embedding-3-small 或类似模型）
-- 2. 调用 update_link_embedding(id, embedding) 存储向量
-- 3. 搜索时调用 search_links_semantic(query_vector, 10) 获取结果
--
-- 示例（TypeScript）：
--   const { data } = await supabase.rpc('search_links_semantic', {
--     query_embedding: queryVector,
--     match_count: 10,
--   });
-- ============================================================
