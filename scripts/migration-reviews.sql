-- ============================================================
-- 用户评价系统 — 数据库迁移脚本
--
-- 使用方法：
--   在 Supabase SQL Editor 中运行此脚本
--
-- 创建表：
--   1. tool_reviews — 工具评价（评分 + 评论）
--   2. review_rate_limits — 评价速率限制
-- ============================================================

-- 1. 工具评价表
CREATE TABLE IF NOT EXISTS tool_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID NOT NULL REFERENCES nav_links(id) ON DELETE CASCADE,
  ip TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  approved BOOLEAN NOT NULL DEFAULT true, -- 默认自动通过，可改为 false 需人工审核
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引：按工具查询评价
CREATE INDEX IF NOT EXISTS idx_tool_reviews_link_id ON tool_reviews(link_id);
CREATE INDEX IF NOT EXISTS idx_tool_reviews_approved ON tool_reviews(approved);
CREATE INDEX IF NOT EXISTS idx_tool_reviews_created_at ON tool_reviews(created_at DESC);

-- 唯一约束：同一 IP 对同一工具只能评价一次
CREATE UNIQUE INDEX IF NOT EXISTS idx_tool_reviews_link_ip_unique ON tool_reviews(link_id, ip);

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tool_reviews_updated_at ON tool_reviews;
CREATE TRIGGER trg_tool_reviews_updated_at
  BEFORE UPDATE ON tool_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 2. 评价速率限制表
CREATE TABLE IF NOT EXISTS review_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random.uuid(),
  ip TEXT NOT NULL,
  link_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_rate_limits_ip ON review_rate_limits(ip);
CREATE INDEX IF NOT EXISTS idx_review_rate_limits_created_at ON review_rate_limits(created_at);

-- 3. RLS 策略

-- tool_reviews: anon 可以读取已通过的评价，可以提交新评价
ALTER TABLE tool_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_reviews FORCE ROW LEVEL SECURITY;

-- 任何人可以读取已批准的评价
CREATE POLICY "Anyone can read approved reviews"
  ON tool_reviews FOR SELECT
  USING (approved = true);

-- 任何人可以提交评价
CREATE POLICY "Anyone can submit reviews"
  ON tool_reviews FOR INSERT
  WITH CHECK (true);

-- 仅管理员可以更新/删除评价
CREATE POLICY "Admin can manage reviews"
  ON tool_reviews FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

CREATE POLICY "Admin can delete reviews"
  ON tool_reviews FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

-- review_rate_limits: anon 可以插入和查询自己的记录
ALTER TABLE review_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_rate_limits FORCE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert review rate limits"
  ON review_rate_limits FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can read review rate limits"
  ON review_rate_limits FOR SELECT
  USING (true);

-- 4. 聚合视图：工具评分统计
CREATE OR REPLACE VIEW tool_review_stats AS
SELECT
  link_id,
  COUNT(*)::INTEGER AS review_count,
  COALESCE(ROUND(AVG(rating), 1), 0)::FLOAT AS avg_rating,
  COUNT(*) FILTER (WHERE rating = 5)::INTEGER AS five_star_count,
  COUNT(*) FILTER (WHERE rating = 4)::INTEGER AS four_star_count,
  COUNT(*) FILTER (WHERE rating = 3)::INTEGER AS three_star_count,
  COUNT(*) FILTER (WHERE rating = 2)::INTEGER AS two_star_count,
  COUNT(*) FILTER (WHERE rating = 1)::INTEGER AS one_star_count
FROM tool_reviews
WHERE approved = true
GROUP BY link_id;

-- 5. 注释
COMMENT ON TABLE tool_reviews IS '用户对 AI 工具的评价（评分 + 评论）';
COMMENT ON COLUMN tool_reviews.rating IS '评分 1-5 星';
COMMENT ON COLUMN tool_reviews.comment IS '评论文本，可为空';
COMMENT ON COLUMN tool_reviews.approved IS '是否通过审核，默认 true';
COMMENT ON TABLE review_rate_limits IS '评价速率限制记录';
COMMENT ON VIEW tool_review_stats IS '工具评分聚合统计视图';
