# 综合导航站 — 项目进度文档

> 最后更新：2026-07-18 · 版本 v17.0（发布收口注记）
> 项目路径：`d:\nav-site` · 开发端口：3264
> **当前生产 HEAD**：`46981a1a` · 主域 `https://yuanjia1314.ccwu.cc`

## 〇、2026-07-18 发布收口（权威入口）

本轮已完成候选冻结 → 生产迁库 → 主域部署探针 → 前台 UX/favicon hotfix。  
**单次事实源**：[`docs/release-manifest-2026-07-18.md`](./release-manifest-2026-07-18.md)  
**主计划收口**：[`docs/optimization-and-release-plan-2026-07-18.md`](./optimization-and-release-plan-2026-07-18.md) §13  
**前台性能**：[`docs/frontend-perf-optimization-2026-07-18.md`](./frontend-perf-optimization-2026-07-18.md)

| 项 | 状态 |
|---|---|
| Admin 模块化 interface + 迁库 | ✅ 生产已应用 |
| 主域 commit 探针 | ✅ 匹配 `46981a1a` |
| 侧栏滚动 / 首屏预算 | ✅ 已上线 |
| Favicon 代理恢复 + monogram | ✅ 已上线（首页 0 破图抽检） |
| Preview 功能探针 | ⚠️ Deployment Protection，不阻断主域 |
| Embedding 常开 | ⚠️ 仍本机 BGE 路径 |

下文 Phase 1–26 为历史进度（至 2026-07-04），数量与平台口径可能漂移；**以 release manifest 与 README 为准**。

---

## 一、项目概览

**定位**：面向开发者的综合资源导航平台，一站式覆盖 AI/云服务/开发工具/开源项目/设计/学习等 9 大分类。

**当前数据规模**：
- 收录站点：513 个（Phase 12 批量导入 + 持续扩充）
- 分类数量：9 个主分类（模型排行榜功能已移除，旧 `model-ranking` URL 自动回退到"全部"）
- 向量维度：512 维（BAAI/bge-small-zh-v1.5 嵌入模型）

> 文档版本 v16.4 · 2026-07-04 · Phase 26 完成：Visual Polish Phase 2 移动优先纸面工作台精修与交接同步

## 二、技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js (App Router + webpack 构建) | 16.2.9 |
| UI | React + Tailwind CSS v4 + shadcn/ui | 19.2.4 |
| 图标 | Lucide React | 1.20.0 |
| 数据库 | Supabase (PostgreSQL + RLS) | 单库模式 |
| 认证 | Auth.js (NextAuth) Credentials | — |
| 搜索 | Fuse.js 服务端模糊搜索 + pgvector 语义搜索 | — |
| 嵌入微服务 | BAAI/bge-small-zh-v1.5 (512 维) | FastAPI + uvicorn |
| 动画 | Motion (Framer Motion) | 12.40.0 |
| 监控 | Sentry (client/server/edge) | — |
| 测试 | Vitest (单元) + Playwright (E2E) | — |
| 部署 | Netlify | — |

---

## 三、质量指标

| 指标 | 状态 | 数值 |
|------|------|------|
| ESLint | 通过 | 0 errors, 1 warning (no-unused-vars) |
| TypeScript | 通过 | 0 errors (strict mode) |
| 单元测试 | 通过 | 169/169 (7 TypeScript test files + 20 Python tests) |
| 搜索质量金标准 | 通过 | 6 条金标准查询 × recall@10 评估框架 |
| 安全测试覆盖率 | 通过 | admin-auth 100%, schemas 100%, utils 100%, with-admin 100%, rate-limit 79% |
| E2E 测试 | 通过 | 52/52 (chromium + mobile-chrome) |
| 生产构建 | 通过 | next build 成功 (28 routes) |

---

## 四、已完成的工作阶段

### Phase 1-7：基础建设与优化（2026-06-23 前）

- 项目初始化：Next.js 16 + React 19 + Tailwind v4 + shadcn/ui
- 数据库架构：双库合并为单库模式（ADR-001）
- 数据访问层：`lib/repositories.ts` 统一抽象
- 程序化 SEO：`/tool/[slug]` 详情页 + JSON-LD 结构化数据
- Agent API：`/api/tools` 结构化 JSON 端点
- 安全加固：RLS 策略、输入验证、速率限制
- 性能优化：ISR 60s、图片懒加载、代码分割
- CI/CD：GitHub Actions (lint + tsc + test + build + e2e + deploy)

### Phase 8：全面测试（2026-06-23）

- 单元测试：73 个测试覆盖类型、API、安全、过滤逻辑
- E2E 测试：9 个场景 × 2 浏览器 = 18 个测试
- 修复端口冲突（3000 → 3001 → 3264）
- 修复搜索测试选择器（`.flex-1` → `main`）
- API 验证：/api/health、/api/tools、/api/reviews、/sitemap.xml 全部正常

### Phase 9：Bug 修复（2026-06-23）

**Bug 1：分类不显示站点**
- 问题：`useLinksFilter.ts` 中 `linkSections` 在选择具体分类时返回空数组
- 修复：添加逻辑，选择具体分类时返回该分类的过滤链接

**Bug 2：移动端导航只显示 4 个分类**
- 问题：`MobileNav.tsx` 使用 `tabs.slice(0, 4)` 限制显示数量
- 修复：移除 slice，添加 `overflow-x-auto scrollbar-hide` 支持横向滚动

### Phase 10：前端美化（2026-06-24）

使用 `web-design-guidelines`、`ui-ux-pro-max`、`shadcn` 三个 Skill 进行系统性美化。

#### 10.1 配色方案统一

| 改动项 | 旧方案 | 新方案 |
|--------|--------|--------|
| 卡片悬停 | 粉色边框 + 粉色光晕 (hue 340) | 蓝色边框 + 柔和阴影 (hue 250) |
| 侧边栏激活态 | 粉色背景 (oklch 0.95 0.02 340) | 蓝色背景 (oklch 0.95 0.03 250) |
| 侧边栏徽章 | 粉色文字 (oklch 0.55 0.15 350) | 蓝色文字 (oklch 0.62 0.18 250) |
| 搜索框焦点 | `focus:border-pink-300/60` | `focus:border-primary/60` |
| 渐变背景 | 淡蓝 → 粉白 → 淡蓝 | 纯蓝色系渐变 |
| 模型排行榜标题 | `text-purple-600` | `text-primary` |

**修改文件**：
- `app/globals.css` — 移除 `.card-pink` 体系，新增 `.card-hover` 体系
- `components/SearchBar.tsx` — 粉色焦点 → 主色焦点

#### 10.2 Favicon 集成

- 使用 JavaScript 预加载机制，三级降级策略：
  1. `https://favicon.im/{domain}` (主源，Cloudflare 加速)
  2. `https://www.google.com/s2/favicons?domain={domain}&sz=64` (备用)
  3. Lucide `Globe` 图标 (兜底)
- 完全避免破损图片显示

**修改文件**：`components/LinkCard.tsx`

#### 10.3 Lucide 图标系统

新建 `lib/category-icons.ts`，12 个分类统一映射 Lucide 图标：

| 分类 slug | Lucide 图标 | 用途 |
|-----------|-------------|------|
| all | LayoutGrid | 全部 |
| free-relay | Zap | 公益中转站 |
| model-ranking | Trophy | 模型排行榜 |
| ai-api | Bot | AI & 大模型 |
| cloud-vps | Cloud | 云服务 & VPS |
| dev-tools | Code2 | 开发工具 |
| design | Palette | 设计资源 |
| online-tools | Wrench | 在线工具 |
| open-source | BookOpen | 开源项目 |
| software | Monitor | 软件应用 |
| learning | GraduationCap | 学习 & 社区 |
| business | Building2 | 企业 & 运营工具 |

#### 10.4 组件美化清单

| 组件 | 改动内容 |
|------|----------|
| `LinkCard.tsx` | Favicon 集成 + `.card-hover` 悬停 + 精选徽章 |
| `SearchBar.tsx` | Lucide `Search`/`X` 图标 + 主色焦点环 |
| `Sidebar.tsx` | 每分类配 Lucide 图标 + 蓝色激活态 + `Compass`/`X` 图标 |
| `Header.tsx` | `⬡` → `Compass`，`Menu`/`Plus`/`Settings` 图标 |
| `MobileNav.tsx` | `◈◉◆○` → Lucide 图标 + 顶部蓝色指示条 |
| `ThemeToggle.tsx` | `☀☾` → `Sun`/`Moon` 图标 |
| `Navigation.tsx` | 空状态 `🔍📭🌊` → `Search`/`PackageOpen`/`Waves` |
| `error.tsx` | `🌊` → `Waves` + `RefreshCw`/`Home` 按钮 |
| `global-error.tsx` | 同上 |
| `nav-config.ts` | 移除所有 emoji 前缀，标签纯文本化 |

### Phase 11：功能扩展（2026-06-24）

#### 11.1 收藏夹功能

基于 localStorage 的客户端收藏系统，无需后端改动。

**新增文件**：
- `lib/use-favorites.ts` — 收藏夹 Hook（localStorage 持久化）
- `components/FavoritesProvider.tsx` — React Context Provider
- `app/favorites/page.tsx` — 收藏页面（SSR 获取链接 + 客户端过滤）
- `app/favorites/FavoritesView.tsx` — 收藏页面客户端组件

**修改文件**：
- `app/layout.tsx` — 包裹 `FavoritesProvider`
- `components/Header.tsx` — 添加收藏入口 + 计数徽章
- `components/LinkCard.tsx` — 添加心形收藏按钮（`Heart` 图标，激活态填充）

**功能**：
- 点击卡片右侧心形图标切换收藏状态
- Header 显示收藏计数
- `/favorites` 页面展示已收藏站点
- 支持清空收藏
- localStorage 持久化，跨会话保留

#### 11.2 Favicon API 代理

**新增文件**：`app/api/favicon/route.ts`

- 服务端代理 favicon.im → Google S2 → 404
- 域名格式验证
- 5 秒超时
- Cache-Control 头（浏览器 1 天 + CDN 7 天）
- LinkCard 优先使用代理 URL

#### 11.3 热门访问排行榜

**修改文件**：
- `components/useLinksFilter.ts` — 新增 `popular` 数组（按 click_count 排序，取前 6）
- `components/DualTrackSection.tsx` — 新增"热门访问"区域（`Flame` 图标）
- `components/Navigation.tsx` — 传递 `popular` prop

首页现在显示三个区域：推荐 → 最新添加 → 热门访问

#### 11.4 链接健康检测 CI 集成

**修改文件**：
- `package.json` — 新增 `check:links` 脚本
- `.github/workflows/ci.yml` — 新增 `link-check` job（部署后运行，上传报告 artifact）

#### 11.5 暗色模式视觉回归

- 亮色/暗色模式全面测试通过
- Favicon 在暗色模式下清晰可见
- 蓝色配色在两种模式下一致
- 微调次要文字对比度（`/50` → `/60`）

### Phase 12：代码扫描修复 + 战略基础设施（2026-06-24）

#### 12.1 全面代码扫描修复（86 项发现）

基于五轴代码审查（正确性/可读性/架构/安全/性能），修复 86 项发现：

**安全 Critical**：
- XSS 修复：JSON-LD `dangerouslySetInnerHTML` 经 `escapeJsonForHtml()` 转义
- 登录 Zod 验证：`loginSchema` + `sameSite: strict`
- 错误消息脱敏：4 个 admin API 路由的 `error.message` → 通用消息 + logger

**架构 Critical**：
- 新建 `lib/utils.ts`：提取 `isSafeUrl`、`extractDomain`、`getClientIp`、`escapeJsonForHtml`
- 新建 `lib/rate-limit.ts`：统一速率限制逻辑（`checkRateLimit`、`recordAttempt`、`checkClickRateLimit`）
- `lib/model-rankings.ts` 层级违反修复：`ModelRanking` 接口移至 `lib/types.ts`

**性能 Critical**：
- `getRelatedLinks` 改为 `.eq("category_id", ...)` 直接查询
- `getApprovedLinksForApi` 改为 `.eq("nav_categories.slug", ...)` 直接查询
- `getApprovedLinks()` 新增 `limit`/`offset` 分页参数

**Important**：
- 死代码清理：删除 8 个未使用函数 + 2 个废弃函数 + `lib/i18n.ts` 整个模块
- `LinkCard` 包裹 `React.memo`，`FavoritesProvider` 添加 `useMemo`
- `/api/reviews` 添加缓存头，`/api/tools` limit 上限 100

#### 12.2 nav_links.slug 列迁移

**新增文件**：`scripts/migration-slug.sql`

- `nav_links` 表新增 `slug` 列 + 唯一索引
- 自动回填已有数据
- Trigger 自动维护 slug（INSERT/UPDATE title 时）
- `getApprovedLinkBySlug` 优先使用 slug 列查询（O(1)），回退兼容未迁移情况

#### 12.3 Auth.js canary → next-auth v5 迁移

**ADR-002**：`docs/adr-002-authjs-migration.md`

- `@auth/core` + `@auth/nextjs` (canary `0.0.0-380f8d56`) → `next-auth@5.0.0-beta.31`
- 导入路径：`@auth/nextjs` → `next-auth`，`@auth/core/providers/credentials` → `next-auth/providers/credentials`
- `encode` 添加 `salt` 参数
- `proxy.ts` 简化类型注解（使用 `next-auth` 推断类型）

#### 12.4 内容录入基础设施

**新增文件**：
- `scripts/bulk-add.mjs` — 批量录入脚本（JSON/TXT 输入、dry-run、自动 slug、URL 去重）
- `.env.local.example` — 环境变量模板

**修改文件**：
- `scripts/add.mjs` — 添加 slugify 函数，写入时生成 slug
- `package.json` — 新增 `bulk:add` 命令

#### 12.5 质量验证

| 指标 | 状态 | 数值 |
|------|------|------|
| ESLint | 通过 | 0 errors, 1 warning |
| TypeScript | 通过 | 0 errors |
| 单元测试 | 通过 | 73/73 |
| 生产构建 | 通过 | 23 routes |

---

### Phase 13：搜索迁移 + API 文档 + 图片优化（2026-06-24）

#### 13.1 搜索迁移至服务端（T14-1）

将 Fuse.js 模糊搜索从客户端迁移到服务端 API，减少客户端 bundle 体积。

**新增文件**：`app/api/search/route.ts`
- GET `/api/search?q=react&category=dev-tools&limit=20`
- 服务端 Fuse.js 搜索，支持分类过滤、结果限制（上限 100）
- 搜索权重：title (2x) > description (1x) > category_name (0.8x)
- `Cache-Control: no-store` 保证实时性

**修改文件**：`components/useLinksFilter.ts`
- 移除客户端 Fuse.js 实例（links 搜索），保留模型排行榜的客户端搜索（小数据集）
- 新增 `serverResults` 和 `searchLoading` 状态
- 200ms 防抖后调用 `/api/search` API
- 搜索时显示单一"搜索结果"分区，非搜索时恢复分类分区

**修改文件**：`components/SearchBar.tsx`
- 新增 `loading` prop，搜索时显示 `Loader2` 旋转图标
- `components/Navigation.tsx` 传递 `searchLoading` 状态

#### 13.2 API 文档页面（T13-6）

**新增文件**：`app/api-docs/page.tsx`
- 文档化 5 个公开 API 端点：`/api/tools`、`/api/search`、`/api/click`、`/api/reviews`、`/api/submit`
- 参数表格、curl 示例、JSON 响应示例、速率限制说明
- Lucide 图标：`FileJson`、`Search`、`MousePointerClick`、`Star`、`Shield`

**修改文件**：`components/Header.tsx`
- 顶栏新增 API 文档链接（`Code2` 图标）

#### 13.3 LinkCard 图片优化（T14-2）

**修改文件**：`components/LinkCard.tsx`
- `<img>` → `<NextImage>`（next/image 组件），`unoptimized` 属性适配 favicon 代理 URL
- 导入重命名为 `NextImage` 避免与浏览器 `Image` 构造函数冲突

**修改文件**：`app/api/favicon/route.ts`
- 新增 Content-Type 白名单：仅放行 `image/*` 类型响应，阻止非图片内容穿透代理

#### 13.4 代码质量修复

- `eslint.config.mjs`：新增 `next-phase-tasks/**` 到 globalIgnores（排除 HTML 报告中的压缩 JS）
- `scripts/add.mjs`、`scripts/bulk-add.mjs`：移除未使用的 `slugify` 函数
- `scripts/create-ai-category.mjs`：移除未使用的 `nextSort` 变量
- `components/useLinksFilter.ts`：`eslint-disable` 块级注释覆盖 debounce effect
- `components/useLinksFilter.test.ts`：mock `global.fetch` 适配服务端搜索测试

#### 13.5 质量验证

| 指标 | 状态 | 数值 |
|------|------|------|
| ESLint | 通过 | 0 errors, 0 warnings |
| TypeScript | 通过 | 0 errors |
| 单元测试 | 通过 | 73/73 |
| 生产构建 | 通过 | 30 routes |

---

### Phase 16：项目文档整理与清理（2026-06-24）

#### 16.1 清理冗余文件

删除以下不再需要的文件和目录：

| 文件/目录 | 删除原因 |
|-----------|----------|
| `ai-nav-research/` | 早期调研报告 HTML，已完成使命 |
| `nav-site-audit/` | 代码审计报告 HTML，已过时 |
| `project-analysis-report.html` | 项目分析报告 HTML，已过时 |
| `scripts/crawl-sources.mjs` | 爬虫脚本，不再使用 |
| `scripts/migrate-to-single-db.mjs` | 双库合并迁移脚本，已执行完毕 |
| `test-results/` | Playwright 测试结果缓存 |

#### 16.2 清理 package.json

- 移除 `@auth/core` 和 `@auth/nextjs` canary 依赖（已迁移到 `next-auth` v5）
- 移除 `sync` 和 `add-help` 无效脚本（`sync-db.mjs` 已删除）
- 更新 `pnpm-lock.yaml` 同步依赖变更

#### 16.3 更新项目文档

**README.md**（全面重写）：
- 更新技术栈表（next-auth v5、服务端搜索、GitHub OAuth）
- 更新环境变量表（新增 GITHUB_ID/SECRET、SUPABASE_SERVICE_ROLE_KEY）
- 更新项目结构树（反映 30 个路由的实际结构）
- 新增 API 端点表（10 个端点）
- 新增架构决策章节（ADR-001 + ADR-002）
- 新增服务端搜索和用户收藏同步说明
- 更新数据库迁移步骤（5 个 SQL 文件）

**DESIGN-DOC.md**（v4.0 → v5.0）：
- 更新分类体系（11 分类、287 站点、含站点数）
- 更新布局结构图（Header 含登录/API 按钮）
- 更新核心组件描述（LinkCard 用 next/image、SearchBar 服务端搜索、ModelRanking 动态导入）
- 重写技术架构章节（单库模式、next-auth v5、服务端搜索、认证流程、SEO 架构）
- 新增已实现功能清单（Phase 1-15）

**eslint.config.mjs**：
- 移除已删除目录的 ignore 规则（`nav-site-audit/`、`ai-nav-research/`、`project-analysis-report.html`）

#### 16.4 质量验证

| 指标 | 状态 | 数值 |
|------|------|------|
| ESLint | 通过 | 0 errors, 0 warnings |
| TypeScript | 通过 | 0 errors |
| 单元测试 | 通过 | 73/73 |
| 生产构建 | 通过 | 30 routes |

---

### Phase 15：UX 完善 + 性能优化（2026-06-24）

#### 15.1 自定义 404 页面

**新增文件**：`app/not-found.tsx`
- 大号 404 数字 + 指南针图标动画
- 三个操作入口：返回首页、搜索工具、提交站点
- 与站点整体设计语言一致

#### 15.2 路由级加载状态

**新增文件**：`app/loading.tsx`
- 复用 `NavSkeleton` 组件作为路由切换加载骨架屏
- 搜索栏、侧边栏、卡片网格的脉冲动画占位

#### 15.3 动态 OG 图片生成

**新增文件**：`app/opengraph-image.tsx`
- 使用 `next/og`（ImageResponse）在 Edge Runtime 动态生成社交分享卡片
- 1200x630 尺寸，深色渐变背景 + 指南针图标
- 展示站点名称、副标题、6 个分类标签、287+ 站点统计
- 自动注入到 `<meta property="og:image">` 标签

#### 15.4 性能优化：ModelRanking 动态导入

**修改文件**：`components/Navigation.tsx`
- `ModelRanking` 改为 `next/dynamic` 动态导入（`ssr: false`）
- 仅在用户滚动到模型排行榜区域时加载客户端 JS
- 加载中显示脉冲骨架占位

#### 15.5 无障碍：跳转到主内容

**修改文件**：`components/Shell.tsx`、`app/layout.tsx`
- 新增 skip-to-content 链接（`sr-only` → `focus:not-sr-only`）
- `<main>` 添加 `id="main-content"` 锚点
- 键盘用户按 Tab 即可跳过导航栏直达内容

#### 15.6 质量验证

| 指标 | 状态 | 数值 |
|------|------|------|
| ESLint | 通过 | 0 errors, 0 warnings |
| TypeScript | 通过 | 0 errors |
| 单元测试 | 通过 | 73/73 |
| 生产构建 | 通过 | 30 routes（新增 /opengraph-image、/not-found） |

---

### Phase 14：用户账号系统（2026-06-24）

#### 14.1 GitHub OAuth 登录

**修改文件**：`lib/auth.ts`
- 新增 GitHub OAuth provider（条件启用：`GITHUB_ID` + `GITHUB_SECRET`）
- `profile` 回调注入 `role: "user"`，Credentials provider 保持 `role: "admin"`
- `jwt` 回调：首次登录时从 `user.role` 写入 `token.role`
- `authorized` 回调：admin 路由检查 `role === "admin"`，阻止普通用户访问

**修改文件**：`proxy.ts`
- middleware 检查 admin 权限（非 admin 用户访问 admin 路由 → 重定向/401）
- 已登录管理员访问 `/login` → 重定向到 `/admin`

**新增文件**：`components/Providers.tsx`
- `SessionProvider` 包装器（client component）
- `app/layout.tsx` 更新：`Providers` → `FavoritesProvider` → `Shell`

**修改文件**：`components/Header.tsx`
- 未登录：显示"登录"按钮（`LogIn` 图标）→ `signIn("github")`
- 已登录：显示"退出"按钮（`LogOut` 图标）→ `signOut()`
- 管理员链接仅对 `role === "admin"` 显示
- `mounted` 状态避免 SSR/CSR 水合不匹配

#### 14.2 收藏同步服务端

**新增文件**：`scripts/migration-user-favorites.sql`
- `user_favorites` 表：`id`、`user_id`、`link_id`、`created_at`
- 唯一约束 `(user_id, link_id)` 防止重复收藏
- RLS 策略：用户只能 CRUD 自己的收藏
- 索引：`user_id` 快速查询

**新增文件**：`app/api/favorites/route.ts`
- `GET /api/favorites` — 获取当前用户收藏列表（返回 link_id 数组）
- `POST /api/favorites` — 批量添加收藏（`{ linkIds: string[] }`）
- `DELETE /api/favorites?linkId=xxx` — 删除单条收藏
- `DELETE /api/favorites?all=true` — 清空所有收藏
- 使用 `SUPABASE_SERVICE_ROLE_KEY` 绕过 RLS（服务端路由自行鉴权）

**修改文件**：`lib/use-favorites.ts`
- 集成 `useSession()` 检测登录状态
- 登录时：从 `/api/favorites` 拉取服务端收藏，合并到 localStorage
- `toggleFavorite`：登录时 fire-and-forget 同步到服务端
- `clearFavorites`：登录时清空服务端收藏
- 未登录时：保持纯 localStorage 行为

**修改文件**：`.env.local.example`
- 新增 `GITHUB_ID`、`GITHUB_SECRET`、`SUPABASE_SERVICE_ROLE_KEY`

#### 14.3 质量验证

| 指标 | 状态 | 数值 |
|------|------|------|
| ESLint | 通过 | 0 errors, 0 warnings |
| TypeScript | 通过 | 0 errors |
| 单元测试 | 通过 | 73/73 |
| 生产构建 | 通过 | 29 routes（新增 /api/favorites） |

---

## 五、项目结构

```
├── app/                    # Next.js App Router
│   ├── api/               # API 路由 (health, tools, click, reviews, submit, admin, favicon)
│   ├── admin/             # 管理后台
│   ├── favorites/         # 收藏夹页面 (SSR + 客户端过滤)
│   ├── tool/[slug]/       # 程序化 SEO 工具详情页
│   ├── submit/            # 提交页面
│   ├── about/             # 关于页面
│   ├── error.tsx          # 错误页面 (Lucide 图标)
│   ├── global-error.tsx   # 全局错误页面
│   ├── globals.css        # 全局样式 (蓝色主色体系)
│   ├── layout.tsx         # 根布局
│   ├── manifest.ts        # PWA 清单
│   ├── robots.ts          # 爬虫规则
│   └── sitemap.ts         # 站点地图
├── components/             # React 组件
│   ├── admin/             # 管理后台组件
│   ├── ui/                # shadcn/ui 组件
│   ├── LinkCard.tsx       # 链接卡片 (Favicon + 蓝色悬停 + 收藏按钮)
│   ├── SearchBar.tsx      # 搜索栏 (Lucide 图标 + 主色焦点)
│   ├── Sidebar.tsx        # 侧边栏 (Lucide 图标 + 蓝色激活)
│   ├── Header.tsx         # 顶栏 (Lucide 图标 + 收藏计数)
│   ├── MobileNav.tsx      # 移动端底栏 (Lucide 图标)
│   ├── Navigation.tsx     # 主导航容器
│   ├── ThemeToggle.tsx    # 主题切换 (Sun/Moon)
│   ├── FavoritesProvider.tsx # 收藏夹 Context Provider
│   └── ...
├── lib/                    # 工具库
│   ├── category-icons.ts  # 分类 → Lucide 图标映射
│   ├── nav-config.ts      # 分类标签配置 (纯文本)
│   ├── use-favorites.ts   # 收藏夹 Hook (localStorage)
│   ├── repositories.ts    # 数据访问层
│   ├── supabase/          # Supabase 客户端
│   ├── types.ts           # TypeScript 类型定义
│   └── ...
├── docs/                   # 文档
│   ├── adr-001-dual-db-merge.md  # 架构决策记录
│   └── PROGRESS.md        # 本文档
├── tests/                  # 单元测试
├── e2e/                    # E2E 测试
└── scripts/                # 脚本
```

---

## 六、API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查，返回分类数量和状态 |
| `/api/tools` | GET | Agent API，支持分类过滤、搜索、限制 |
| `/api/search` | GET | 服务端 Fuse.js 模糊搜索 |
| `/api/click` | POST | 点击计数（sendBeacon） |
| `/api/reviews` | GET/POST | 工具评价 |
| `/api/submit` | POST | 站点提交 |
| `/api/favicon` | GET | Favicon 代理（Content-Type 白名单） |
| `/api/favorites` | GET/POST/DELETE | 用户收藏同步（需登录） |
| `/api/admin/*` | GET/POST/PUT/DELETE | 管理员 CRUD |
| `/sitemap.xml` | GET | 站点地图 (72 URLs) |
| `/robots.txt` | GET | 爬虫规则 |

---

## 七、设计规范（v4.0 更新）

### 7.1 颜色体系（OKLCH + 蓝色主色）

```
底色        oklch(1 0 0)                    #FFFFFF
文字主色    oklch(0.13 0.01 250)            #0F172A
文字辅色    oklch(0.45 0.01 250)            #64748B

主色        oklch(0.62 0.18 250)            #3B82F6 (蓝色)
主色背景    oklch(0.95 0.03 250 / 0.25)     蓝色淡背景
主色边框    oklch(0.62 0.18 250 / 40%)      蓝色边框

灰色边框    oklch(0.92 0.01 250)            #E2E8F0
灰色背景    oklch(0.97 0 0)                 #F8FAFC

暗色底色    oklch(0.12 0.008 260)
暗色主色    oklch(0.62 0.18 250)
```

### 7.2 图标规范

- **图标库**：Lucide React (统一风格)
- **分类图标**：通过 `lib/category-icons.ts` 统一管理
- **尺寸**：导航/侧边栏 16px (`h-4 w-4`)，底栏 18px (`h-[18px] w-[18px]`)
- **颜色**：激活态 `text-primary`，非激活态 `text-muted-foreground/50`
- **禁止使用 emoji 作为功能图标**

### 7.3 卡片悬停规范

```
Default:  白色背景 + 1px 灰色边框
Hover:    蓝色边框 (40% opacity) + 上浮 2px + 柔和蓝色阴影
          图标放大 1.1x + 标题变蓝
过渡:     0.2s cubic-bezier(0.32, 0, 0.08, 1)
```

---

## 八、开发命令

```bash
pnpm dev          # 开发服务器 (端口 3264)
pnpm build        # 生产构建
pnpm start        # 生产服务器
pnpm lint         # ESLint
pnpm test         # 单元测试
pnpm test:coverage # 单元测试 + 覆盖率
pnpm e2e          # E2E 测试
pnpm e2e:ui       # E2E 交互式模式
pnpm analyze      # Bundle 分析
pnpm check:links  # 链接健康检测
pnpm add          # 单条录入站点
pnpm bulk:add     # 批量录入站点 (JSON/TXT)
pnpm sync         # 数据库同步
```

---

### Phase 18：安全测试覆盖（2026-06-27）

#### 18.1 安全模块测试

| 模块 | 覆盖率 | 测试内容 |
|------|--------|----------|
| `admin-auth.ts` | 100% | 鉴权通过/失败 |
| `schemas.ts` | 100% | URL/标题/slug/分类/标签/链接ID Zod schema 校验 |
| `utils.ts` | 100% | URL 安全校验、域名提取、客户端 IP 提取、JSON HTML 转义 |
| `with-admin.ts` | 100% | 只读/写入路由包装器（鉴权 + Zod 校验） |
| `rate-limit.ts` | 79% | 内存桶限流、DB 限流、点击限流、记录尝试 |

**新增测试**：76 个，安全测试文件 `tests/security.test.ts` 共计 99 个测试用例。

#### 18.2 其他修复

- 升级 TypeScript 5.0.2 → 5.1.3（消除 build warning）
- 修复 `themeColor` 构建警告（Next.js 16 Metadata → Viewport API 迁移）
- 配置 Dependabot（每周 npm 更新，reviewer xvyimu）
- 修复安全测试中原始 U+2028 字符导致 ESLint 解析错误
- GitHub 项目全面扫描（master 分支保护、CI 历史失败分析）

#### 18.3 质量验证

| 指标 | 状态 | 数值 |
|------|------|------|
| ESLint | 通过 | 0 errors, 1 warning (no-unused-vars) |
| TypeScript | 通过 | 0 errors |
| 单元测试 | 通过 | 150/150 (4 test files) |
| 生产构建 | 通过 | next build 成功 |

### Phase 19：GitHub 标准文档补齐（2026-06-27）

#### 19.1 新增标准 GitHub 文档

| 文件 | 说明 |
|------|------|
| `LICENSE` | MIT 开源许可证 |
| `CHANGELOG.md` | 版本发布日志（基于 git 历史整理） |
| `CONTRIBUTING.md` | 贡献指南（命名规范、代码风格、PR 流程） |
| `SECURITY.md` | 安全策略（漏洞报告流程 + 安全审计清单） |
| `.github/ISSUE_TEMPLATE/bug_report.md` | Bug 报告模板 |
| `.github/ISSUE_TEMPLATE/feature_request.md` | 功能请求模板 |

#### 19.2 文档更新

- `PROGRESS.md`：更新测试数 73→150、日期 6/24→6/27、新增安全测试覆盖率指标
- `DESIGN-DOC.md`：统一版本号 v11.0（头部 v6.0 → v11.0）

#### 19.3 清理过时构件

- 删除 `deliverables/` 目录（过时的审查报告快照）
- 删除 `.workbuddy/` 目录（过时的工作记忆缓存）

---

### Phase 20：新一轮修复优化（2026-06-28）

#### 20.1 修复项

| 修复项 | 说明 | 文件 |
|--------|------|------|
| TypeScript 类型 | 修复 `tests/security.test.ts` 的 `Response` / `NextResponse` 类型不匹配，`pnpm typecheck` 恢复通过 | `tests/security.test.ts` |
| CSP hydration | 开发/E2E 下 CSP 阻止 Next hydration 的问题；`next.config.ts` 只在 dev 模式允许 `unsafe-eval`，生产 CSP 不放宽 | `next.config.ts` |
| E2E 稳定性 | 导航根节点加 hydration 标记，调整搜索 E2E 避免 SSR 可见但客户端事件未挂载时就输入导致假失败 | `e2e/home.spec.ts`, `components/Navigation.tsx` |
| 工具详情空白页 | 未知 slug 渲染现有 404 UI | `app/tool/[slug]/page.tsx`, `app/tool/[slug]/not-found.tsx`（新增） |
| API 动态路由 | `/api/tools` 改为显式动态路由，消除构建时 `Dynamic server usage` 日志 | `app/api/tools/route.ts` |
| SQL typo | 修复 `migration-reviews.sql` 里的 `gen_random.uuid()` | `scripts/migration-reviews.sql` |
| 密码 fallback | 移除 `dedupe-figma-api.mjs` 的 `admin123` 默认密码 fallback | `scripts/dedupe-figma-api.mjs` |
| 审计漏洞 | 添加 `postcss` override 到 `pnpm-workspace.yaml`，审计漏洞已清零 | `pnpm-workspace.yaml`, `pnpm-lock.yaml` |
| ESLint warning | 移除未用 import，忽略 coverage 产物 | `eslint.config.mjs` |

#### 20.2 质量验证

| 指标 | 状态 | 数值 |
|------|------|------|
| ESLint | 通过 | 0 errors, 0 warnings |
| TypeScript | 通过 | 0 errors |
| 单元测试 | 通过 | 150/150 (4 test files) |
| 生产构建 | 通过 | next build 成功 ✅ |
| 审计 | 通过 | 无已知漏洞 ✅ |
| E2E | 通过 | 34/34 ✅ |

#### 20.3 数据库迁移确认

经查询生产库（`vyqqbypwrbdcafanzwmj`），确认此前标记为待办的 SQL 迁移**实际上早已执行**：

| 迁移 | 验证结果 |
|------|----------|
| `migration-slug.sql` | slug 列已存在、全部 513 条数据已回填、唯一索引 `idx_nav_links_slug_approved` 有效、trigger `trg_nav_links_auto_slug` 已注册 |
| `migration-user-favorites.sql` | `user_favorites` 表已创建、3 条 RLS 策略（SELECT/INSERT/DELETE）已生效 |

---

### Phase 21：pgvector 语义搜索基础（2026-06-28）

#### 21.1 基础实现

- 引入 BAAI/bge-small-zh-v1.5 本地嵌入微服务（FastAPI + uvicorn，端口 8003）
- 实现 `/api/search?semantic=true` 语义搜索端点
- Fuse.js 回退机制：embedding 服务不可用时自动降级到模糊搜索
- pgvector 512 维向量存储 + `search_links_semantic` RPC 余弦相似度搜索
- 新增 Python embedding 测试（10 tests）

**核心文件**：
- `scripts/embed-server.py` — 嵌入微服务（BGE 模型，端口 8003）
- `scripts/backfill-embeddings.py` — 回填脚本
- `scripts/migration-pgvector.sql` — pgvector 扩展 + 向量列 + RPC
- `scripts/tests/test_embed_server.py` — 嵌入服务测试
- `scripts/tests/test_backfill.py` — 回填脚本测试

#### 21.2 质量验证

| 指标 | 状态 | 数值 |
|------|------|------|
| ESLint | 通过 | 0 errors, 0 warnings |
| TypeScript | 通过 | 0 errors |
| 单元测试 | 通过 | 150/150 |
| Python 测试 | 通过 | 20/20 |
| 513 条 embedding 回填 | 通过 | 全部成功 |

---

### Phase 22：搜索质量优化（2026-06-28） ✅

**Pipeline**: Planner → Coder → Tester → Reviewer → **SHIP**

#### 22.1 七项优化

| # | 优化项 | 优先级 | 说明 |
|---|--------|--------|------|
| 1 | BGE query prefix | P0 | 查询向量加中文前缀 `"为这个句子生成表示以用于检索相关文章："`，文档向量不加（BGE 官方要求） |
| 2 | 增强 embedding 文本 | P0 | 回填文本格式 `"title description [分类名]"`，包含分类名提升语义区分度 |
| 3 | 短查询保护 | P0 | `<3` 字符跳过语义搜索，回退 Fuse.js（避免短查询低质量匹配） |
| 4 | ~~词边界关键词匹配~~ | — | 已废弃（被 RRF 替代，RRF subsumes 关键字提升全部逻辑） |
| 5 | 业务信号加权 | P1 | featured/paid +0.05 similarity boost，click_count>5 +0.02 |
| 6 | RRF 混合排序 | P2 | K=60 互惠排名融合，替代 bucket 策略，消除 keyword 饥饿 |
| 7 | 金标准评估框架 | Infra | 6 条金标准查询 × recall@10，`QUALITY_TEST_BASE_URL` 集成测试 |

#### 22.2 代码变更

| 文件 | 变更 |
|------|------|
| `app/api/search/route.ts` | `MIN_SEMANTIC_QUERY_LENGTH=3`、embed endpoint → `/embed-query`、RRF `mergeResults()`、删除 `isStrongKeywordMatch()`、`SemanticRow` 新增 featured/paid/click_count、business signal boost |
| `scripts/embed-server.py` | 新增 `BGE_QUERY_PREFIX` 常量 + `/embed-query` 端点 |
| `scripts/backfill-embeddings.py` | `fetch_links()` join 分类名、`generate_embedding_text()` 输出 `"title description [分类名]"` |
| `scripts/migration-pgvector.sql` | RPC 新增返回 `featured BOOLEAN`, `paid BOOLEAN`, `click_count INTEGER` |
| `tests/search-optimization.test.ts` | 新建，14 个测试覆盖全部 7 项优化 |
| `tests/search-quality.test.ts` | 新建，金标准集成测试 |
| `tests/fixtures/golden-queries.json` | 新建，6 条金标准查询 |

#### 22.3 数据库回填

- 513 条 embedding 全部回填完成（`backfill-embeddings.py --apply`）
- 分类名已嵌入 embedding 文本，提升语义区分度
- RPC 已更新返回业务信号字段

#### 22.4 质量验证

| 指标 | 状态 | 数值 |
|------|------|------|
| ESLint | 通过 | 0 errors, 0 warnings |
| TypeScript | 通过 | 0 errors |
| Vitest 单元测试 | 通过 | 169 passed, 6 skipped |
| Python 测试 | 通过 | 20/20 |
| Review Verdict | **SHIP** | 7 项优化全部正确实现，无安全漏洞，无回归 |

---

### Phase 23：生产稳定性收尾（2026-07-03） ✅

#### 23.1 数据访问边界加固

提交：`b1fae067 fix: harden data access boundaries`

| 项目 | 状态 | 说明 |
|------|------|------|
| Admin CRUD service_role 收口 | ✅ | Admin 写路径使用 `createServiceRoleClient()`，公开读保持 anon + RLS |
| Slug 一致性 | ✅ | `/api/tools`、详情页和相关工具链接优先使用数据库 `slug` |
| API JSON 错误边界 | ✅ | favorites/submit/click/reviews 无效 JSON 返回 400，不再落入 500 |
| Supabase timeout 真实取消 | ✅ | 资源库接口和详情页使用 query builder `.abortSignal(...)` |
| 分类语义搜索召回 | ✅ | 分类搜索扩大 RPC 候选池后再本地过滤，降低全局高分挤占风险 |

#### 23.2 运行稳定性补丁

| commit | 内容 |
|------|------|
| `43b263a` | 首页 Supabase 慢查询使用 `AbortSignal.timeout`，超时降级为空数据而非挂起 |
| `fb59c60d` | embedding 服务故障重试节流，降低 outage 时的请求放大 |
| `58dce1b3` | 明确 optional tags fallback 日志，减少误报 |

### Phase 24：排行榜移除与视觉收尾（2026-07-04） ✅

提交：`352bfa02 refactor: remove model rankings + unify visual primitives`

| 项目 | 状态 | 说明 |
|------|------|------|
| 模型排行榜移除 | ✅ | 删除 `components/ModelRanking.tsx`、`lib/model-rankings.ts` 和页面加载链路 |
| 旧 URL 兼容 | ✅ | `?cat=model-ranking` 归一化为 `all`，不会出现空白页 |
| 深色背景统一 | ✅ | Header/Footer/atlas/html/body 统一 `#07100f`，修复底部白色区域 |
| UI primitive | ✅ | 新增 `AtlasPill`、`InteractiveSurface`，复用到首页、搜索面板、卡片和移动导航 |
| 回归验证 | ✅ | `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 通过；7897 端口浏览器验证无排行榜入口且底部为深色 |

---

### Phase 25：Shijiucode-inspired 纸面视觉改造（2026-07-04） ✅

设计文档：`docs/superpowers/specs/2026-07-04-shijiucode-inspired-visual-redesign.md`

| 项目 | 状态 | 说明 |
|------|------|------|
| 全局纸面色彩 | ✅ | 新增 `--paper-*` 视觉变量，页面背景切为暖米白，主色统一为低饱和蓝灰 |
| 首页 Hero | ✅ | 移除深色大图背景和玻璃感，压缩首屏高度，改为中文衬线标题 + 搜索优先布局 |
| 导航外壳 | ✅ | Header、Sidebar、Footer、移动底栏统一浅色纸面样式，保留原有交互和键盘入口 |
| 搜索与筛选 | ✅ | SearchBar、SearchExperiencePanel、AtlasPill 改为淡蓝灰纸面控件，语义搜索状态保留 |
| 卡片与预览 | ✅ | LinkCard、ToolQuickView 改为浅色纸面卡片；ResultGrid 补 `grid-cols-1` 修复移动端内容撑宽 |
| 浏览器验证 | ✅ | 7897 端口桌面 1440×1100、移动 390×844 检查通过，无 console error，无页面横向溢出 |
| 视觉回归与 E2E | ✅ | 3264 端口刷新 Shijiucode-inspired hero 视觉快照；visual spec 2/2 通过，全量 Playwright E2E 50/50 通过 |
| 移动底栏可读性 | ✅ | 320/360/390 宽度复测分类标签无遮挡、无裁切、无页面横向溢出；新增低宽度 E2E 防回退 |

质量验证：

- `pnpm lint` ✅
- `pnpm typecheck` ✅
- `pnpm test` ✅ `309 passed / 6 skipped`
- `pnpm build` ✅
- `pnpm exec playwright test e2e/visual.spec.ts --update-snapshots --reporter=line` ✅ 快照已刷新，复跑 `2 passed`
- `pnpm exec playwright test --grep '低宽度底栏分类文字保持可读|移动端布局正常|分类导航存在并可切换' --reporter=line` ✅ `6 passed`
- `pnpm exec playwright test --reporter=line` ✅ `52 passed`

---

### Phase 26：Visual Polish Phase 2 移动优先纸面工作台精修（2026-07-04） ✅

设计文档：`docs/superpowers/specs/2026-07-04-visual-polish-phase2-design.md`

| commit | 内容 |
|---|---|
| `0322366a` | 新增 Visual Polish Phase 2 设计文档：移动优先纸面工作台精修 |
| `9d2b773f` | 实现移动优先视觉精修：压缩 mobile hero、弱化 paper surface 阴影、降低 Header/MobileNav 重量、收紧 SearchExperiencePanel |

| 项目 | 状态 | 说明 |
|------|------|------|
| 移动首屏密度 | ✅ | 390×844 下 hero 高度从约 1126px 降到约 621px，Atlas 顶部进入首屏 |
| 纸面层级减重 | ✅ | Header、MobileNav、`.nav-glass` surface 降低阴影和 blur，整体更接近简洁低饱和纸面工作台 |
| 搜索面板收束 | ✅ | SearchExperiencePanel 移动端减少 chip 数量，降低首屏拥挤感 |
| 移动底栏 | ✅ | 高度收束到约 66px，不再遮挡 hero metrics；320/360/390/430 宽度标签无裁切 |
| 端口说明 | ✅ | `7897` 被本机进程占用且不返回 nav-site；本轮浏览器复查使用 `localhost:3264` |
| Playwright caveat | ✅ | Playwright CLI 目标 E2E 在 webServer 生命周期处卡住且无断言失败；改用系统 Chrome + Playwright API 完成等价手动断言 |

质量验证：

- `pnpm lint` ✅
- `pnpm typecheck` ✅
- `pnpm test` ✅ `316 passed / 6 skipped`
- `pnpm build` ✅
- 浏览器手动复查 ✅ desktop 1440×1100、mobile 390×844
- 移动断言 ✅ 320/360/390/430 宽度 hydration 正常、MobileNav 存在、无横向溢出、标签无裁切

---

## 九、待办事项

### 短期
- [x] Favicon 加载成功率优化（已实现 API 代理 + 三级降级）
- [x] 暗色模式下的视觉回归测试（已通过，微调对比度）
- [x] 全面代码扫描修复（86 项发现已修复）
- [x] nav_links.slug 列迁移（SQL + 应用层兼容）
- [x] Auth.js canary → next-auth v5 迁移
- [x] 内容批量录入脚本
- [x] .env.local.example 环境变量模板
- [x] 批量导入 228 个站点（59 → 287）
- [x] 创建 ai-api 分类
- [x] 搜索迁移至服务端 API（减少客户端 bundle）
- [x] API 文档页面（/api-docs）
- [x] LinkCard 图片优化（next/image + favicon Content-Type 白名单）
- [x] 用户账号系统（GitHub OAuth + 收藏同步）
- [x] 自定义 404 页面 + 路由级 loading 骨架屏
- [x] 动态 OG 图片生成（next/og Edge Runtime）
- [x] 模型排行榜移除（减少维护面，旧 URL 回退到"全部"）
- [x] 无障碍 skip-to-content 链接
- [x] 运行 migration-slug.sql 到 Supabase — ✅ 已执行（slug 列+索引+trigger）
- [x] 运行 migration-user-favorites.sql 到 Supabase — ✅ 已执行（表+RLS）
- [ ] 配置 GitHub OAuth App（Callback URL: /api/auth/callback/github）
- [x] 移动端底栏图标在低分辨率下的可读性测试（320/360/390 通过，已加 E2E 防回退）

### 中期
- [ ] 分类层级支持（父/子分类）— 需数据库 schema 变更
- [ ] 标签系统（多标签交叉过滤）— 需数据库 schema 变更
- [x] 热门排行榜（按点击量排序）— 已实现"热门访问"区域
- [x] 链接健康检测 — 脚本已有，CI 已集成
- [x] 收藏夹功能 — 已实现 localStorage + /favorites 页面
- [ ] 批量录入至 500+ 站点（当前 287，持续扩充中）
- [ ] Google Search Console 提交

### 长期
- [x] pgvector 语义搜索 ✅ (Phase v21)
- [x] 搜索质量调优 ✅ (Phase v22: BGE prefix + 增强文本 + 短查询保护 + RRF + 业务信号 + 金标准评估)
- [ ] 国际化 (i18n)
- [ ] PWA 离线支持

---

> 文档版本 v16.4 · 2026-07-04 · Phase 26 完成：Visual Polish Phase 2 移动优先纸面工作台精修与交接同步
