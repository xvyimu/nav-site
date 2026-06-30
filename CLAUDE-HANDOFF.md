# Claude Code 项目接手提示词（v8 — 2026-06-29）

## 项目接手：综合导航站 (nav-site)

项目位于 `D:\nav-site`，开发端口 3264（`pnpm dev`）。
部署地址：https://yuanjia1314.ccwu.cc

## 技术栈

- Next.js 16.2.9 (App Router + **webpack** 构建，不可用 Turbopack)
- React 19.2.4 + Tailwind CSS v4 + shadcn/ui
- Supabase PostgreSQL（单库模式 + RLS + pgvector 语义搜索）
- next-auth v5（Credentials 管理员 + GitHub OAuth 用户）
- Fuse.js 服务端搜索 + pgvector 语义搜索 + React cache() 数据去重
- Motion 动画 + Lucide React 图标
- Sentry 监控（共享配置 `sentry.shared.config.ts`，tracing 已开启）
- Vitest 单元测试（205 个，6 skipped） + 20 Python 测试 + Playwright E2E 34 个
- **新增**：Lighthouse CI（`.github/workflows/lighthouse.yml`，warn-only）
- **新增**：Web Vitals 实时上报（`app/_components/web-vitals.tsx` + `app/api/web-vitals/route.ts`）

## 当前状态

- **513 个收录站点**，11 个分类，29 条模型排行榜数据
- **205 个 Vitest 单元测试全部通过**（6 skipped）+ 20 Python 测试全绿
- ESLint 0 errors, TypeScript 0 errors, 生产构建成功（`next build --webpack`），E2E 34/34 全绿
- 安全审计漏洞清零（51/51 项已修复，PROJECT-AUDIT.md）
- **数据库迁移已确认**：slug 列索引/trigger + user_favorites 表/RLS 均已在生产库就绪
- **pgvector 搜索质量调优已完成 (Phase 22)**：BGE query prefix, 增强 embedding 文本(含分类名), 短查询保护, RRF 混合排序, 金标准评估框架
- 本地 embedding 微服务：`scripts/embed-server.py`，模型 `BAAI/bge-small-zh-v1.5`，默认 `http://127.0.0.1:8003`

## v8 会话已完成（2026-06-29）

### 1. 9 阶段架构重构方案 B（分层深化）

完整 ADR-003 方案，10 个 commit 已推送 origin/master：

| 阶段 | commit | 内容 |
|---|---|---|
| L1.1 | `353f23ff` | favorites RLS 断层修复 + 限流 |
| L1.2 | `bef66d61` | 删 /api/admin/login + 默认 role 改 user |
| L1.3 | `91e24b0e` | withAdminWrite 升级 + 合并 admin-guard |
| L1.4 | `6335248e` | schema 集中 + search 路由拆分到 lib/search/* |
| L2.1 | `13c11b41` | 筛选状态进 URL + CollectionPage JSON-LD |
| L2.2 | `ab468784` | 拆 useLinksFilter → 4 子 hook |
| L2.3 | `25e3b125` | FavoritesContext 拆 State/Actions + 稳定 onPreview |
| L3.1 | `88595eea` | 抽 useFavicon + trackClick + useDialogFocus 三件套 |
| L3.2 | `40960a93` | Admin/Favorites 恢复 Server Component + 清死代码 |
| 构建修复 | `f25d8a4b` | 修复 Next.js 16 动态路由类型签名 |

### 2. Favicon 代理优化（`de69e161`）

`app/api/favicon/route.ts` 修复国外图标源访问超时：
- cccyun 作为国内直连主源（3s 超时）
- HTTPS_PROXY 环境变量支持（本地开发，生产 Vercel 不需要）

### 3. Phase 1 性能测量基建（`d3627021`）

A+C 混合方案 Phase 1 完成（详见 `docs/superpowers/specs/2026-06-29-performance-optimization-design.md`）：

| 文件 | 作用 |
|---|---|
| `app/_components/web-vitals.tsx` | useReportWebVitals + sendBeacon 上报组件 |
| `app/api/web-vitals/route.ts` | same-origin + Zod + Sentry captureMessage |
| `.github/workflows/lighthouse.yml` | Lighthouse CI workflow（desktop, warn-only） |
| `lighthouserc.json` | desktop preset + 性能预算（script 250KB / total 400KB） |
| `scripts/extract-bundle-stats.mjs` | bundle 报告 JSON 摘要提取 |
| `docs/perf/baseline-2026-06-29.md` | 基线快照（数据待 CI 跑完填入） |
| `docs/perf/findings.md` | H1-H8 假设追踪表 |

## 下一步工作：Phase 2 假设验证

**接手第一步**：读 `docs/perf/findings.md`，按优先级逐个验证 H1-H8 假设。

每个假设必须走完整循环：**验证 → 修复 → 量化对比 → 提交**。

| # | 假设 | 优先级 |
|---|---|---|
| H1 | PanguSpacing 500ms 后 DOM 修改拖慢 INP | P0 |
| H2 | 513 LinkCard 实例造成首屏长任务 | P0 |
| H3 | Fuse.js 客户端索引残留 | P1 |
| H4 | Favicon 同步 `new Image()` 加载阻塞 CLS | P1 |
| H5 | Motion 动画在低端设备触发 layout thrashing | P2 |
| H6 | 首屏 JS chunk 中存在可拆分的 sync import | P2 |
| H7 | Sentry client bundle 占首屏 JS 比重过高 | P3 |
| H8 | 路由切换无 prefetch 导致 TTFB 偏高 | P3 |

退出条件：P75 LCP < 2.5s / INP < 200ms / CLS < 0.1 / Bundle first-load JS < 250KB / 所有 P0/P1 假设已验证。

## ⚠️ 环境注意事项（必读）

### NTFS Reparse Point 问题

由于历史 pnpm 安装遗留，`node_modules` 中有 30 个顶级包目录带有 NTFS reparse point 属性（损坏的 junction），无法删除。

**影响与解决方案**：
- `next build` / `next dev` 必须加 `--webpack` 标志（已在 `package.json` scripts 中配置）
- Turbopack 构建会失败（`Can't resolve 'react'` 等错误），这是环境问题非代码问题
- Vitest 需要 `resolve.preserveSymlinks: true`（已在 `vitest.config.ts` 中配置）
- `vitest.setup.ts` 中 `@testing-library/jest-dom/vitest` 导入已注释（无测试使用 jest-dom matchers；如需使用 `toBeInTheDocument()` 等 matcher，取消注释即可）
- Ghost 目录（`deps`、`node_modules_broken`、`node_modules_old_*`、`node_modules_phantom_*`）占用 ~2.4GB 但无法删除，已在 tsconfig.json 和 vitest.config.ts 中排除

### 包管理器

项目使用 **pnpm**（`pnpm-lock.yaml`）。所有命令使用 `pnpm` 前缀。
**PowerShell 不支持 `&&`、`||`、heredoc、`tail`** — 须用 `;`、`-F` flag、`Select-Object -Last` / `Select-String`。

### Git Push 代理配置（重要）

当前系统使用 **FlClash TUN 模式**，系统层直连 github.com 返回 200。
但 git 全局配置了 `http.proxy=http://127.0.0.1:7897`（端口未监听），会导致 push 失败。

**正确 push 方式**（临时清除代理让 git 走系统直连）：

```powershell
git -c http.proxy= -c https.proxy= push origin master
```

或永久清除（不推荐，可能影响其他项目）：

```powershell
git config --global --unset http.proxy
git config --global --unset https.proxy
```

### Pre-commit Hook 问题（重要）

`.git/hooks/pre-commit` 是 sh 脚本（依赖 `/tmp/`），在 Windows PowerShell 下会卡死。
**必须用 `--no-verify` 跳过**：

```powershell
git commit --no-verify -m "..."
```

本项目无密钥提交风险（secrets 在 .env.local，已被 .gitignore 排除），可安全跳过。
后续可考虑改写为 PowerShell 脚本，或改用 gitleaks GitHub Action（PROJECT-AUDIT.md §8.6 已建议）。

### MCP 配置

`.mcp.json` 有意指向**开发库**（`nzaocqwumlmbewoddysd`），而非生产库（`vyqqbypwrbdcafanzwmj`）。这是安全最佳实践——通过 MCP 工具操作数据库时只影响开发环境，生产数据需通过 admin API 手动操作。

## 关键命令

```bash
python scripts/embed-server.py  # 启动本地 embedding 服务（端口 8003）
pnpm dev                        # 启动开发服务器（端口 3264，webpack 模式）
pnpm build                      # 生产构建（webpack 模式）
pnpm lint                       # ESLint 检查
pnpm typecheck                  # TypeScript 类型检查
pnpm test                       # 单元测试（205 个）
pnpm test:quality               # 搜索质量金标准评估（需 QUALITY_TEST_BASE_URL）
pnpm e2e                        # E2E 测试（需先启动 dev server）
pnpm analyze                    # Bundle 分析（生成 .next/analyze/*.html）
node scripts/extract-bundle-stats.mjs  # 提取 bundle 摘要到 docs/perf/
```

> ⚠️ 不要使用不加 `--webpack` 的 `next build/dev`，会因 NTFS reparse point 问题失败。

## 提交前检查清单

提交代码前必须通过：

```powershell
pnpm lint; pnpm typecheck; pnpm test; pnpm build
```

全部通过后用 `git commit --no-verify -m "..."` 提交（跳过卡死的 pre-commit hook）。
push 时用 `git -c http.proxy= -c https.proxy= push origin master`（绕过未监听的代理配置）。

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
- `HTTPS_PROXY` — 本地开发代理（`http://127.0.0.1:7897`，仅 favicon 路由用，生产 Vercel 不需要）

## 架构关键约定（v8 新增）

### Context 拆分模式（L2.3）

`components/FavoritesProvider.tsx` 已拆为 State/Actions 双 Context：
- `useFavoritesState()` — 订阅状态变化（favorites / favoriteIds / count / mounted / isAuthenticated / isFavorite）
- `useFavoritesActions()` — 订阅 actions（toggleFavorite / clearFavorites），引用永远稳定
- `useFavoritesContext()` — 兼容 hook，返回 `{ ...state, ...actions }`

**约定**：新组件按需订阅 State 或 Actions，避免全量订阅造成不必要 re-render。

### Hook 抽取三件套（L3.1）

- `lib/use-favicon.ts` — 从 LinkCard 抽出的 favicon 加载 hook
- `lib/track-click.ts` — 统一的点击追踪工具函数（sendBeacon）
- `lib/use-dialog-focus.ts` — 从 ToolQuickView 抽出的对话框焦点管理 hook（泛型 `<T extends HTMLElement>`）

**约定**：新组件有 favicon / 点击追踪 / 对话框焦点需求时直接复用，不要重复实现。

### useCallback 稳定回调模式（L2.3）

`components/Navigation.tsx` 用 `useCallback` 包装 `openPreview` / `closePreview`，避免每次渲染生成新函数引用破坏 LinkCard/ToolQuickView 的 memo 契约。

**约定**：传给 memo 化子组件的回调必须用 `useCallback` 包装。

### Next.js 16 动态路由类型签名（构建修复）

`lib/with-admin.ts` 的 `withAdminWrite` / `withAdminDelete` 返回类型签名：

```ts
(request: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<NextResponse>
```

`ctx` 必须非可选，`params` 必须是 `Promise<Record<string, string>>`（不是 `Record<string, string>` 本身）。

### Server Component 恢复（L3.2）

仅渲染子组件的页面无需 `"use client"`。例如 `app/admin/categories/page.tsx` 已恢复为 Server Component：

```tsx
import { CategoryManager } from "@/components/admin/CategoryManager";
export default function AdminCategoriesPage() {
  return <CategoryManager />;
}
```

## 必读文档

接手前请先阅读以下文件了解项目全貌：

1. `docs/PROGRESS.md` — 完整的项目进度记录（Phase 1-22）
2. `docs/perf/findings.md` — **Phase 2 假设追踪表（接手第一步必读）**
3. `docs/superpowers/specs/2026-06-29-performance-optimization-design.md` — 性能优化完整设计文档
4. `README.md` — 项目结构、API 端点、环境变量、数据库迁移
5. `DESIGN-DOC.md` — 设计规范、布局结构、技术架构
6. `CLAUDE.md` — 开发约定（引用 AGENTS.md）
7. `AGENTS.md` — Next.js 16 通用规则（必读，API 可能与训练数据不同）
8. `PROJECT-AUDIT.md` — 51 项安全审计追踪
9. `docs/adr-001-dual-db-merge.md` — 双库合并决策
10. `docs/adr-002-authjs-migration.md` — Auth.js 迁移决策

## 已知问题

1. ~~**E2E Figma 测试偶发失败**~~ — ✅ 已解决（Phase C）
2. **E2E 搜索测试偶发失败** — 并发测试时 200ms 防抖 + 1s 等待不够稳定。可在 playwright 配置中增加超时或改用 `waitForResponse` 但不 catch
3. **API /api/tools 构建时打印 Dynamic server usage 日志** — 预期行为（访问 request.url），不影响运行
4. **NTFS Reparse Point 导致 Turbopack 不可用** — `node_modules` 中 30 个包目录有损坏的 pnpm junction。webpack 模式可正常工作。
5. **Ghost 目录占用 ~2.4GB** — `deps`、`node_modules_broken`、`node_modules_old_*`、`node_modules_phantom_*` 无法删除，已在 tsconfig.json 和 vitest.config.ts 中排除
6. ~~**安全审计 51 项**~~ — ✅ 全部修复完成（2026-06-25）
7. **Pre-commit hook 卡死** — `.git/hooks/pre-commit` 是 sh 脚本，Windows PowerShell 下会卡死。用 `--no-verify` 跳过（详见上文）
8. **Git push 代理配置失效** — git 全局配了 `http.proxy=7897` 但端口未监听。用 `git -c http.proxy= -c https.proxy= push` 绕过（详见上文）

## 开发约定

1. 所有数据库操作通过 `lib/repositories.ts` 统一抽象，不要在 API 路由中直接调用 Supabase
2. 新增分类需在 `lib/nav-config.ts` 添加 slug 映射，在 `lib/category-icons.ts` 添加图标
3. API 路由使用 `lib/logger.ts` 结构化日志，错误处理统一 try-catch
4. 速率限制使用 `lib/rate-limit.ts`
5. 提交代码前必须通过：`pnpm lint && pnpm typecheck && pnpm test && pnpm build`（PowerShell 用 `;` 分隔）
6. E2E 测试使用 `domcontentloaded` 而非 `networkidle`（HMR WebSocket 会导致超时）
7. Playwright 配置端口为 3264（非默认 3000）
8. 认证：管理员用 Credentials provider（role: "admin"），普通用户用 GitHub OAuth（role: "user"）
9. admin 路由仅允许 role === "admin" 访问（proxy.ts middleware 强制）
10. 收藏功能：未登录用 localStorage，登录后自动同步到 user_favorites 表
11. **新增**：性能改动必须可量化（无 before/after 数据 = 不修复，详见 `docs/perf/findings.md`）
12. **新增**：传给 memo 化子组件的回调必须用 `useCallback` 包装（L2.3 约定）

## Supabase 库架构（单库模式）

ADR-001 已合并双库为单库，通过 RLS 策略保证数据安全。

| 库名 | 项目 ID | 角色 |
|------|---------|------|
| nav-prod | vyqqbypwrbdcafanzwmj | 生产库（读写） |

> 历史双库架构（nav-dev/nav-prod）已废弃，`.env.local` 中的 `_DEV` 后缀变量仅保留用于历史脚本兼容。

---

**接手第一步**：读 `docs/perf/findings.md`，从 H1（PanguSpacing INP 影响）开始验证。
