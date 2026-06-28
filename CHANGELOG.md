# Changelog

## [Unreleased]

### 搜索质量优化
- feat: pgvector 语义搜索基础实现（BAAI/bge-small-zh-v1.5 本地嵌入微服务，端口 8003）
- feat: BGE query prefix — 查询向量加中文检索前缀，文档向量不加
- feat: 增强 embedding 文本 — 回填 `"title description [分类名]"` 格式
- feat: 短查询保护 — <3 字符跳过语义搜索，回退 Fuse.js
- feat: RRF 混合排序（K=60 互惠排名融合）替代 bucket 策略
- feat: 业务信号加权 — featured/paid +0.05, click_count>5 +0.02
- feat: 金标准评估框架 — 6 条查询 × recall@10，`QUALITY_TEST_BASE_URL` 集成测试
- chore: 513 条 embedding 回填（含分类名）
- test: 新增 14 个搜索优化 TypeScript 测试 + 20 个 Python 测试
- test: 单元测试总数 150→169

- fix: 修复安全测试中原始 U+2028 字符导致 ESLint 解析错误
- chore: 新增 CONTRIBUTING.md / SECURITY.md / LICENSE / Issue 模板
- chore: 配置 Dependabot 自动依赖更新
- chore: 升级 TypeScript 5.0.2 → 5.1.3
- fix: 修复 themeColor 构建警告（Next.js 16 Metadata → Viewport API 变更）

## [0.1.0] — 2026-06-27

### 安全增强
- security: 安全测试覆盖率达 90%+（admin-auth 100%，schemas 100%，utils 100%，rate-limit 79%）
- security: 新增 76 个安全测试（限流/鉴权/Zod 校验/超时/IP 提取/HTML 转义）
- fix: Favicon 代理替换 — 弃用 favicon.im（403），改用 DuckDuckGo + Google S2 + 直连三级降级
- fix: 添加 color-scheme + theme-color 原生 UI 主题适配

### CI/CD
- ci: Netlify 部署集成（NETLIFY_SITE_ID 已配置）
- ci: 链接健康检查 CI（continue-on-error，数据质量报告）
- ci: E2E 测试端口固定 3264，避免 3000 端口冲突
- ci: 修复多项 CI 问题（secrets 名称不匹配、健康检查、构建产物传递）

### 代码质量
- chore: 触发 Netlify 部署验证流水线
- fix: 移除 nav_links_tags join 查询（生产库缺少该表）
- fix: 解决 E2E 空状态和工具详情页 500 错误
- fix: 添加 Supabase 数据获取超时

---

## [0.0.2] — 2026-06-26

### 功能
- feat: 管理后台统一化、收藏夹、标签、评价、API 文档
- feat: 链接健康检测脚本 + CI 集成
- feat: 热门访问排行榜（按点击量排序）
- feat: 自定义 404 页面 + 路由级加载骨架屏
- feat: 动态 OG 图片生成（next/og Edge Runtime）
- feat: ModelRanking 动态导入（减少初始 JS bundle）
- feat: 无障碍 skip-to-content 链接

### UX
- design: 粉色主题 → 蓝色主色体系（OKLCH 色值）
- design: Lucide 图标全面替换 emoji
- design: 侧边栏 + 全宽布局
- design: 暗色模式视觉回归测试通过
- feat: Favicon API 代理 + 三级降级策略
- feat: 收藏夹功能（localStorage + /favorites 页面）

### 搜索
- feat: 搜索迁移至服务端 Fuse.js API（减少客户端 bundle）
- feat: API 文档页面（/api-docs）
- feat: LinkCard 图片优化（next/image + Content-Type 白名单）

### 代码质量
- refactor: 新建 `lib/utils.ts`、`lib/rate-limit.ts` 统一工具函数和限流逻辑
- security: 86 项代码扫描发现修复（XSS、SQL 注入防护、安全头完善）
- security: Zod schema 验证覆盖所有 API 路由
- security: 速率限制双层架构（Supabase DB + in-memory Map fallback）
- test: 73 个单元测试 + 34 个 E2E 测试
- test: 搜索、收藏、404、API 文档、工具详情页、移动端全覆盖

### 数据库
- feat: nav_links.slug 列迁移（SEO 友好 URL）
- feat: 用户收藏表 + RLS 策略
- feat: 批量录入脚本（JSON/TXT，dry-run，自动 slug）

### 认证
- feat: GitHub OAuth 登录
- feat: 收藏同步服务端（登录用户跨设备同步）
- feat: Auth.js canary → next-auth v5 迁移

---

## [0.0.1] — 2026-06-20

### 初始版本
- feat: Linear 风格暗色设计系统
- feat: 白/黑/蓝三色主题，双分区布局（官方站 vs 公益中转站）
- feat: P1 核心功能 — 暗色模式、点击追踪、分类重构、Badge 系统
- refactor: 清理未使用组件，提取共享配置
- feat: 双库隔离架构（开发库写入 + 生产库只读）
- feat: 模型排行榜（7 维度 29 条数据）
- feat: qcy33 风格重构 — 侧边栏 + 紧凑卡片 + 粉色悬停体系
- feat: Sentry 错误追踪接入
- security: Round 1+2 安全加固（CSP/CSRF/限流/Zod/健康检查）
- security: 预提交钩子防止密钥泄露
- ci: 部署从 Vercel 迁移到 Netlify
- chore: 项目文档 v1.0（README / DESIGN-DOC / 架构决策记录）
- test: 初始测试框架（Vitest + Playwright）
