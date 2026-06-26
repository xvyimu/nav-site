-- ──────────────────────────────────────────────
-- user_favorites 表 — 用户收藏同步
-- 在 Supabase SQL Editor 中执行
-- ──────────────────────────────────────────────

-- 1. 创建 user_favorites 表
CREATE TABLE IF NOT EXISTS user_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,          -- next-auth token.sub (GitHub user id)
  link_id UUID NOT NULL REFERENCES nav_links(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, link_id)
);

-- 2. 索引：按用户查询收藏列表
CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id
  ON user_favorites(user_id);

-- 3. RLS 策略：用户只能管理自己的收藏
ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;

-- 用户只能读取自己的收藏
CREATE POLICY "users_select_own_favorites"
  ON user_favorites FOR SELECT
  USING (
    auth.jwt() ->> 'sub' = user_id
  );

-- 用户只能插入自己的收藏
CREATE POLICY "users_insert_own_favorites"
  ON user_favorites FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'sub' = user_id
  );

-- 用户只能删除自己的收藏
CREATE POLICY "users_delete_own_favorites"
  ON user_favorites FOR DELETE
  USING (
    auth.jwt() ->> 'sub' = user_id
  );

-- 4. 更新时间戳触发器（可选）
-- user_favorites 不需要更新操作，跳过
