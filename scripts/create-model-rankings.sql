-- =============================================
-- model_rankings 表 — 模型排行榜独立表
-- 在 https://supabase.com/dashboard/project/vyqqbypwrbdcafanzwmj/sql/new 执行
-- =============================================

-- 1. 建表
CREATE TABLE IF NOT EXISTS model_rankings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rank INTEGER NOT NULL,
  model_name TEXT NOT NULL,
  source TEXT NOT NULL,
  score TEXT,
  description TEXT,
  icon TEXT DEFAULT '🤖',
  url TEXT,
  category TEXT NOT NULL DEFAULT 'closed',
  extra JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_model_rankings_source ON model_rankings(source);
CREATE INDEX IF NOT EXISTS idx_model_rankings_rank ON model_rankings(source, rank);

-- 2. RLS
ALTER TABLE model_rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read rankings" ON model_rankings FOR SELECT USING (true);
CREATE POLICY "Anon insert rankings" ON model_rankings FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon update rankings" ON model_rankings FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anon delete rankings" ON model_rankings FOR DELETE USING (true);

-- 3. updated_at 自动更新
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_model_rankings_updated_at ON model_rankings;
CREATE TRIGGER trg_model_rankings_updated_at BEFORE UPDATE ON model_rankings
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 4. 导入数据（从 DEV 库同步后会自动写入）
--    首次部署后运行 pnpm sync 或等待 GitHub Actions 定时同步周期