# Claude Code 项目接手提示词（v6 — 2026-06-28）

## 项目接手：综合导航站 (nav-site)

项目位于 `D:\nav-site`，开发端口 3264（`pnpm dev`）。
部署地址：https://yuanjia1314.ccwu.cc

## 技术栈

- Next.js 16.2.9 (App Router + **webpack** 构建)
- React 19.2.4 + Tailwind CSS v4 + shadcn/ui
- Supabase PostgreSQL（单库模式 + RLS + pgvector 语义搜索）
- next-auth v5（Credentials 管理员 + GitHub OAuth 用户）
- Fuse.js 服务端搜索 + pgvector 语义搜索 + React cache() 数据去重
- Motion 动画 + Lucide React 图标
- Sentry 监控（共享配置 `sentry.shared.config.ts`）
- Vitest 单元测试（74 个） + Playwright E2E 测试

## 当前状态

- **513 个收录站点**，11 个分类，29 条模型排行榜数据
- 150 个单元测试全部通过
- ESLint 0 errors, TypeScript 0 errors, 生产构建成功（`next build --webpack`），E2E 34/34 全绿
- 安全审计漏洞清零（postcss override 已配置）
- **数据库迁移已确认**：slug 列索引/trigger + user_favorites 表/RLS 均已在生产库就绪
- **pgvector 语义搜索已完成**：生产库 vector 扩展/RPC/索引就绪，513 个链接 embedding 已回填
- 本地 embedding 微服务：`scripts/embed-server.py`，模型 `BAAI/bge-small-zh-v1.5`，默认 `http://127.0.0.1:8003`

## ⚠️ 环境注意事项（必读）

### NTFS Reparse Point 问题

由于历史 pnpm 安装遗留，`node_modules` 中有 30 个顶级包目录带有 NTFS reparse point 属性（损坏的 junction），无法删除。这些目录包含真实文件（通过 robocopy 复制），但 **Turbopack 无法遍历 reparse point**。

**影响与解决方案：**
- `next build` / `next dev` 必须加 `--webpack` 标志（已在 `package.json` scripts 中配置）
- Turbopack 构建会失败（`Can't resolve 'react'` 等错误），这是环境问题非代码问题
- Vitest 需要 `resolve.preserveSymlinks: true`（已在 `vitest.config.ts` 中配置）
- `vitest.setup.ts` 中 `@testing-library/jest-dom/vitest` 导入已注释（无测试使用 jest-dom matchers；如需使用 `toBeInTheDocument()` 等 matcher，取消注释即可）
- Ghost 目录（`deps`、`node_modules_broken`、`node_modules_old_*`、`node_modules_phantom_*`）占用 ~2.4GB 但无法删除，已在 tsconfig.json 和 vitest.config.ts 中排除

### 包管理器

项目使用 **pnpm**（`pnpm-lock.yaml`，`node_modules` 由 pnpm 安装）。历史上从 pnpm 迁移到过 npm，后又迁回 pnpm。所有命令使用 `pnpm` 前缀。

### MCP 配置

`.mcp.json` 有意指向**开发库**（`nzaocqwumlmbewoddysd`），而非生产库（`vyqqbypwrbdcafanzwmj`）。这是安全最佳实践——通过 MCP 工具操作数据库时只影响开发环境，生产数据需通过 admin API 手动操作。

## 已完成任务

### v4 会话：审计剩余项全量修复（P2/P3）

| 优先级 | 变更 | 文件 |
|--------|------|------|
| P2-1 | sectionLabels 提取至 nav-config | `lib/nav-config.ts`, `components/useLinksFilter.ts` |
| P2-2 | rankColors/bgColors 提取至配置，移除未使用 SOURCE_LABELS/COLORS | `lib/nav-config.ts`, `components/ModelRanking.tsx` |
| P2-3 | 点击追踪 IP+URL 去重（checkClickRateLimit + recordClick） | `app/api/click/route.ts` |
| P2-4 | PanguSpacing 添加架构说明注释 | `components/PanguSpacing.tsx` |
| P2-5 | Sentry 添加 environment/release 标签 | `sentry.*.config.ts` |
| P2-6 | .gitignore 添加 `!.env.example` 例外 | `.gitignore` |
| P2-7 | MCP 配置改为开发库 | `.mcp.json` |
| P2-12 | CI 从 npm 迁移回 pnpm | `.github/workflows/ci.yml` |
| P3-2 | globals.css rgb 统一为 oklch | `app/globals.css` |
| P3-3 | UI 文案确认全部中文化 | — |
| P3-4 | NavSkeleton 硬编码提取为常量 | `components/NavSkeleton.tsx` |
| P3-6 | Analytics 添加 anonymize_ip | `components/Analytics.tsx` |
| P3-7 | sitemap 添加 /about | `app/sitemap.ts` |
| P3-8 | robots.txt disallow /admin | `app/robots.ts` |
| P3-10 | Sentry server/edge 提取共享配置 | `sentry.shared.config.ts`（新建） |
| P3-11 | vitest.setup.ts 添加 matchMedia/IntersectionObserver/ResizeObserver mock | `vitest.setup.ts` |
| P3-12 | relativeTime 改为基于日历月份精确计算，支持"X年前" | `lib/types.ts`, `lib/types.test.ts` |
| P3-13 | 添加 Firefox scrollbar-width/scrollbar-color | `app/globals.css` |
| P3-14 | 删除 pnpm-workspace.yaml（已迁移 npm） | 已删除 |
| P3-15 | .env.example NEXT_PUBLIC_SITE_URL 标记为可选 | `.env.example` |

### v3 会话：安全审计修复（P0/P1/P2）

| 优先级 | 变更 | 文件 |
|--------|------|------|
| P0-1 | 移除 CSP `unsafe-eval`/`unsafe-inline`（script-src 保留 unsafe-inline 用于 GTM） | `next.config.ts` |
| P0-2 | `/api/favorites` 从 service role key 改为 anon key + RLS | `app/api/favorites/route.ts` |
| P0-3 | 登录速率限制 fail-close（DB 故障时内存计数器拒绝） | `lib/rate-limit.ts` |
| P0-4 | 所有数据操作下沉到 repositories 层 | `lib/repositories.ts` + 6 个 API 路由 |
| P0-5 | 统一密码验证函数 `verifyAdminPassword`（timingSafeEqual） | `lib/auth.ts` |
| P0-6 | 移除 NextAuth `authorized()` 回调，admin layout 角色检查 | `lib/auth.ts`, `app/admin/layout.tsx` |
| P0-7 | 移除死代码（`lib/supabase/admin.ts`） | 已删除 |
| P0-8 | `shadcn` 移至 devDependencies | `package.json` |
| P0-9 | 移除未使用的 `clsx` 和 `tailwind-merge` | `package.json` |
| P1-a | Fuse.js 60 秒缓存 + AbortController 取消过期请求 | `app/api/search/route.ts`, `components/useLinksFilter.ts` |
| P1-b | FavoritesView 用 Set + useMemo 优化 | `app/favorites/FavoritesView.tsx` |
| P1-c | 共享 Zod schema 集中到 `lib/schemas.ts` | `lib/schemas.ts`（新建）+ 所有 API 路由 |
| P2 | NextAuth 类型声明消除 `as unknown as` 断言 | `types/next-auth.d.ts`（新建） |

### v2 会话：功能优化

| Phase | 内容 | 状态 |
|-------|------|------|
| A-1 | Sonner 加载状态优化（移除冗余 loading） | ✅ |
| A-2 | Sitemap ISR（revalidate=3600 + createStaticClient） | ✅ |
| B | 批量录入站点（287 → 514，达标 500+） | ✅ |
| C | Figma 双条目去重（admin API 删除重复记录） | ✅ |
| 框架整理 | 删除冗余文件 + 更新过时文档 | ✅ |

## 必读文档

接手前请先阅读以下文件了解项目全貌：

1. `docs/PROGRESS.md` — 完整的项目进度记录（Phase 1-17）
2. `README.md` — 项目结构、API 端点、环境变量、数据库迁移
3. `DESIGN-DOC.md` — 设计规范、布局结构、技术架构
4. `CLAUDE.md` — 开发约定和代码规范
5. `docs/adr-001-dual-db-merge.md` — 双库合并决策
6. `docs/adr-002-authjs-migration.md` — Auth.js 迁移决策

## 关键命令

```bash
python scripts/embed-server.py  # 启动本地 embedding 服务（端口 8003）
pnpm dev                       # 启动开发服务器（端口 3264，webpack 模式）
pnpm build                     # 生产构建（webpack 模式）
pnpm lint         # ESLint 检查
pnpm typecheck    # TypeScript 类型检查
pnpm test         # 单元测试
pnpm e2e          # E2E 测试（需先启动 dev server）
pnpm analyze      # Bundle 分析
```

> ⚠️ 不要使用 `pnpm` 或不加 `--webpack` 的 `next build/dev`，会因 NTFS reparse point 问题失败。

## 环境变量

`.env.local` 已配置齐全。`.env.local.example` 为完整模板。
关键变量：
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase 连接
- `AUTH_SECRET` — Auth.js 加密密钥
- `ADMIN_PASSWORD` — 管理员密码
- `SUPABASE_SERVICE_ROLE_KEY` — 服务端绕过 RLS
- `SUPABASE_SERVICE_ROLE_KEY_PROD` — 生产库 service role，优先级高于 `SUPABASE_SERVICE_ROLE_KEY`
- `EMBED_SERVER_URL` — 本地 embedding 服务地址，默认 `http://127.0.0.1:8003`
- `GITHUB_ID` / `GITHUB_SECRET` — GitHub OAuth（已配置）
- `NEXT_PUBLIC_SITE_URL` — 站点 URL（SEO 用）

## v2 会话已完成的工作

| 类别 | 变更 | 文件 |
|------|------|------|
| 🔧 修复 | TS 类型错误（e2e/home.spec.ts 225行） | `e2e/home.spec.ts` |
| 🎨 UI | 移动端底部导航图标/文字/对比度优化 | `MobileNav.tsx` |
| 🔍 搜索 | 搜索结果关键词高亮组件 | `lib/highlight.tsx`（新建） |
| 🔍 搜索 | 搜索高亮注入 LinkCard/DualTrackSection/CategorySection/Navigation | 4 个组件 |
| 📦 动态导入 | ShortcutPanel → dynamic（Server Component） | `layout.tsx` |
| 📦 动态导入 | MobileNav → dynamic (ssr:false, Client Component) | `Navigation.tsx` |
| 📦 动态导入 | Toaster (sonner) → dynamic, ~50KB saved | `layout.tsx` |
| ⚡ 缓存 | React cache() 包裹 getCategories / getApprovedLinks / getApprovedLinkBySlug / getAllApprovedLinkSlugs | `repositories.ts` |
| ⚡ 缓存 | React cache() 包裹 getModelRankings | `model-rankings.ts` |
| ⚡ 缓存 | React cache() 包裹 getRelatedLinks | `repositories.ts` |
| 📋 文档 | .env.local.example 同步为完整模板 | `.env.local.example` |
| 🗄️ 迁移 | slug 唯一约束 + user_favorites 表 + RLS 完整迁移脚本 | `scripts/migration-complete.sql` |
| 🔐 配置 | SUPABASE_SERVICE_ROLE_KEY / GITHUB_ID / GITHUB_SECRET 加入 .env.local | `.env.local` |
| 🔄 API | /api/tools 已有 Cache-Control 头 | 已验证 |
| 🔄 API | /api/favicon 已有聚合缓存策略 | 已验证 |
| 🔄 API | /api/search 已有 no-store 策略 | 已验证 |

## 后续可做任务

### 🧹 后续可做

- 分类层级支持（父/子分类）
- 标签系统（多标签交叉过滤）
- 用户提交审核流程优化
- 语义搜索排序质量调优（embedding 文本、阈值、混排策略）

## 已知问题

1. ~~**E2E Figma 测试偶发失败**~~ — ✅ 已解决（Phase C）
2. **E2E 搜索测试偶发失败** — 并发测试时 200ms 防抖 + 1s 等待不够稳定。可在 playwright 配置中增加超时或改用 `waitForResponse` 但不 catch
3. **API /api/tools 构建时打印 Dynamic server usage 日志** — 预期行为（访问 request.url），不影响运行
4. **NTFS Reparse Point 导致 Turbopack 不可用** — `node_modules` 中 30 个包目录有损坏的 pnpm junction。webpack 模式可正常工作。
5. **Ghost 目录占用 ~2.4GB** — `deps`、`node_modules_broken`、`node_modules_old_*`、`node_modules_phantom_*` 无法删除，已在 tsconfig.json 和 vitest.config.ts 中排除
6. ~~**安全审计 51 项**~~ — ✅ 全部修复完成（2026-06-25）

## 开发约定

1. 所有数据库操作通过 `lib/repositories.ts` 统一抽象，不要在 API 路由中直接调用 Supabase
2. 新增分类需在 `lib/nav-config.ts` 添加 slug 映射，在 `lib/category-icons.ts` 添加图标
3. API 路由使用 `lib/logger.ts` 结构化日志，错误处理统一 try-catch
4. 速率限制使用 `lib/rate-limit.ts`
5. 提交代码前必须通过：`pnpm lint && pnpm typecheck && pnpm test && pnpm build`
6. E2E 测试使用 `domcontentloaded` 而非 `networkidle`（HMR WebSocket 会导致超时）
7. Playwright 配置端口为 3264（非默认 3000）
8. 认证：管理员用 Credentials provider（role: "admin"），普通用户用 GitHub OAuth（role: "user"）
9. admin 路由仅允许 role === "admin" 访问（proxy.ts middleware 强制）
10. 收藏功能：未登录用 localStorage，登录后自动同步到 user_favorites 表

## Supabase 库架构（单库模式）

ADR-001 已合并双库为单库，通过 RLS 策略保证数据安全。

| 库名 | 项目 ID | 角色 |
|------|---------|------|
| nav-prod | vyqqbypwrbdcafanzwmj | 生产库（读写） |

> 历史双库架构（nav-dev/nav-prod）已废弃，`.env.local` 中的 `_DEV` 后缀变量仅保留用于历史脚本兼容。

---

请先阅读 `docs/PROGRESS.md`，然后告诉我你计划推进哪些任务。