# 综合导航站 — 项目进度文档

> 最后更新：2026-06-24 · 版本 v10.0
> 项目路径：`d:\nav-site` · 开发端口：3264

---

## 一、项目概览

**定位**：面向开发者的综合资源导航平台，一站式覆盖 AI/云服务/开发工具/开源项目/设计/学习等 9 大分类。

**当前数据规模**：
- 收录站点：287 个（Phase 12 批量导入 228 个）
- 分类数量：11 个（含"全部"和"模型排行榜"两个特殊分类）
- 模型排行榜：29 条（7 个维度榜单）

---

## 二、技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js (App Router + Turbopack) | 16.2.9 |
| UI | React + Tailwind CSS v4 + shadcn/ui | 19.2.4 |
| 图标 | Lucide React | 1.20.0 |
| 数据库 | Supabase (PostgreSQL + RLS) | 单库模式 |
| 认证 | Auth.js (NextAuth) Credentials | — |
| 搜索 | Fuse.js 服务端模糊搜索 | — |
| 动画 | Motion (Framer Motion) | 12.40.0 |
| 监控 | Sentry (client/server/edge) | — |
| 测试 | Vitest (单元) + Playwright (E2E) | — |
| 部署 | Netlify | — |

---

## 三、质量指标

| 指标 | 状态 | 数值 |
|------|------|------|
| ESLint | 通过 | 0 errors, 0 warnings |
| TypeScript | 通过 | 0 errors (strict mode) |
| 单元测试 | 通过 | 73/73 (4 test files) |
| E2E 测试 | 通过 | 34/34 (chromium + mobile-chrome) |
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
- [x] ModelRanking 动态导入（减少初始 JS bundle）
- [x] 无障碍 skip-to-content 链接
- [ ] 运行 migration-slug.sql 到 Supabase
- [ ] 运行 migration-user-favorites.sql 到 Supabase
- [ ] 配置 GitHub OAuth App（Callback URL: /api/auth/callback/github）
- [ ] 移动端底栏图标在低分辨率下的可读性测试

### 中期
- [ ] 分类层级支持（父/子分类）— 需数据库 schema 变更
- [ ] 标签系统（多标签交叉过滤）— 需数据库 schema 变更
- [x] 热门排行榜（按点击量排序）— 已实现"热门访问"区域
- [x] 链接健康检测 — 脚本已有，CI 已集成
- [x] 收藏夹功能 — 已实现 localStorage + /favorites 页面
- [ ] 批量录入至 500+ 站点（当前 287，持续扩充中）
- [ ] Google Search Console 提交

### 长期
- [ ] pgvector 语义搜索
- [ ] 国际化 (i18n)
- [ ] PWA 离线支持

---

> 文档版本 v11.0 · 2026-06-24 · Phase 17 完成：E2E 测试扩充至 34 项（覆盖搜索、收藏、404、API 文档、工具详情页、移动端）
