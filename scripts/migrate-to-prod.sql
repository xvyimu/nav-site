-- ============================================
-- AI 导航站 - 新库迁移脚本
-- 目标项目: vyqqbypwrbdcafanzwmj
-- 请在 Supabase Dashboard → SQL Editor 中执行
-- ============================================

-- 1. 建表
CREATE TABLE IF NOT EXISTS nav_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nav_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  category_id UUID REFERENCES nav_categories(id) ON DELETE SET NULL,
  approved BOOLEAN DEFAULT false,
  paid BOOLEAN DEFAULT false,
  featured BOOLEAN DEFAULT false,
  click_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. RLS
ALTER TABLE nav_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE nav_links ENABLE ROW LEVEL SECURITY;

-- 3. 策略
CREATE POLICY "Public read categories" ON nav_categories
  FOR SELECT USING (true);

CREATE POLICY "Public read approved links" ON nav_links
  FOR SELECT USING (approved = true);

CREATE POLICY "Anon insert links" ON nav_links
  FOR INSERT WITH CHECK (true);

-- 4. 索引
CREATE INDEX IF NOT EXISTS idx_nav_links_category ON nav_links(category_id);
CREATE INDEX IF NOT EXISTS idx_nav_links_approved ON nav_links(approved);
CREATE INDEX IF NOT EXISTS idx_nav_links_featured_paid ON nav_links(featured DESC, paid DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nav_categories_sort ON nav_categories(sort_order);

-- 5. 权限
GRANT SELECT ON nav_categories TO anon;
GRANT SELECT ON nav_links TO anon;
GRANT INSERT ON nav_links TO anon;

-- 6. 种子数据 - 分类
INSERT INTO nav_categories (id, name, slug, description, icon, sort_order) VALUES
  ('4591beee-9d26-4922-accf-3a88a7deb2f6', 'AI 对话', 'ai-chat', 'AI 聊天助手与对话工具', '💬', 1),
  ('54e6568b-a39e-4a43-baf3-3302ca14d75d', 'AI 绘画', 'ai-art', 'AI 图像生成与编辑工具', '🎨', 2),
  ('cf12187e-e250-4dfa-967c-58fed1024220', 'AI 编程', 'ai-coding', 'AI 编程助手与代码工具', '💻', 3),
  ('12bdcac6-defc-4ef3-ab7a-ecc6e41788c1', 'AI 视频', 'ai-video', 'AI 视频生成与编辑工具', '🎬', 4),
  ('8ddc9ad7-745f-4812-896b-3230bc1cbc3b', '开发工具', 'dev-tools', '开发者常用工具与平台', '🛠️', 5),
  ('8fa1e856-ce0e-4225-a97f-def28c36e3b2', '设计资源', 'design', '设计工具与素材资源', '✨', 6),
  ('0b7f918e-bed2-4b0f-9876-0cb6e8f6a6b0', '效率工具', 'productivity', '提升工作效率的工具', '⚡', 7),
  ('4608512c-333a-4c4c-a107-581c002d9aab', '学习资源', 'learning', '在线学习与教程平台', '📚', 8)
ON CONFLICT (id) DO NOTHING;

-- 7. 种子数据 - 链接
INSERT INTO nav_links (id, title, url, description, icon, category_id, approved, featured, paid) VALUES
  ('ec102f85-400c-4924-aa31-5778806b5c45', 'ChatGPT', 'https://chat.openai.com', 'OpenAI 推出的 AI 对话助手', '🤖', '4591beee-9d26-4922-accf-3a88a7deb2f6', true, true, false),
  ('e4a12d59-7a74-424d-b8ea-af83cf0af4fd', 'Claude', 'https://claude.ai', 'Anthropic 出品的 AI 助手，擅长分析与创作', '🧠', '4591beee-9d26-4922-accf-3a88a7deb2f6', true, true, false),
  ('c383a40a-bdc0-4e53-8b1b-8fa1b677cbca', 'DeepSeek', 'https://chat.deepseek.com', '深度求索 AI 对话，支持深度思考', '🔍', '4591beee-9d26-4922-accf-3a88a7deb2f6', true, false, false),
  ('0a8201b5-9db3-44a9-9dfd-528257c62b44', 'Midjourney', 'https://midjourney.com', 'AI 艺术图像生成工具', '🎭', '54e6568b-a39e-4a43-baf3-3302ca14d75d', true, true, false),
  ('c665f119-76c5-4af1-9012-a29569aefe7e', 'Stable Diffusion', 'https://stability.ai', '开源 AI 图像生成模型', '🖼️', '54e6568b-a39e-4a43-baf3-3302ca14d75d', true, false, false),
  ('da94b481-65ac-4f99-b8b6-d5b31c7269c0', 'GitHub Copilot', 'https://github.com/features/copilot', 'GitHub AI 编程助手', '🐙', 'cf12187e-e250-4dfa-967c-58fed1024220', true, true, false),
  ('083ed723-6fbf-4a9b-ae33-8c95b1df7823', 'Cursor', 'https://cursor.sh', 'AI 驱动的代码编辑器', '📝', 'cf12187e-e250-4dfa-967c-58fed1024220', true, true, false),
  ('9024236b-1dd9-4481-9ceb-846f33ed27d4', 'Sora', 'https://sora.com', 'OpenAI 视频生成模型', '🎥', '12bdcac6-defc-4ef3-ab7a-ecc6e41788c1', true, true, false),
  ('c9540c7b-a944-4ea1-b9da-6149e3b339cf', 'Vercel', 'https://vercel.com', '前端部署与托管平台', '▲', '8ddc9ad7-745f-4812-896b-3230bc1cbc3b', true, false, false),
  ('9b4ffcb9-f16e-447e-a33f-20b6fad1e5b6', 'Supabase', 'https://supabase.com', '开源 Firebase 替代方案，基于 PostgreSQL', '⚡', '8ddc9ad7-745f-4812-896b-3230bc1cbc3b', true, false, false),
  ('ea7f10a5-c62d-46c7-9c59-95b1774eda1b', 'Figma', 'https://figma.com', '协作界面设计工具', '🎨', '8fa1e856-ce0e-4225-a97f-def28c36e3b2', true, true, false),
  ('d359e5ea-bbcb-434e-8925-fff06dc584f1', 'Notion', 'https://notion.so', '一体化工作空间与笔记工具', '📋', '0b7f918e-bed2-4b0f-9876-0cb6e8f6a6b0', true, false, false)
ON CONFLICT (id) DO NOTHING;
