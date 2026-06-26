# 架构与依赖诊断报告（架构师 · 高见远）

> 项目：nav-site（综合导航站）
> 日期：2026-07-21
> 方法：只读分析（Read/Grep/Glob），未修改任何源代码

---

## 执行摘要

nav-site 是一个基于 Next.js 16 App Router 的综合导航站，采用"app（路由）→ lib/repositories.ts（数据访问）→ supabase 客户端"的三层架构。整体架构设计意图清晰，ISR 缓存策略合理，安全头配置完善，Sentry 集成规范。但存在一个核心矛盾：**repository 抽象层仅被约一半的 API 路由遵守**，另一半路由（favorites、click、submit、health、admin CRUD）直接调用 supabase 客户端或自行创建 service role 客户端，导致数据访问逻辑分散、抽象层形同虚设。此外，`clsx` 和 `tailwind-merge` 两个依赖在源码中完全未被引用，`shadcn` CLI 工具误放在 dependencies 中，`next-auth` beta 版本带来供应链风险。

**问题统计：🔴高 3 / 🟡中 12 / 🟢低 6，共 21 项**

---

## 一、架构合理性

### [🔴高] 数据访问层（repositories.ts）被大量 API 路由绕越

**描述**：项目注释声明"页面组件和 API 路由通过此层访问数据，不直接调用 Supabase"（`lib/repositories.ts:11-13`），但实际有 8 个 API 路由直接 import supabase 客户端，完全绕过 repository 层：

| 路由文件 | 绕越方式 | 直接操作的表 |
|---------|---------|------------|
| `app/api/favorites/route.ts:2` | 直接 import `@supabase/supabase-js`，自建 service role 客户端（行 9-16） | `user_favorites` |
| `app/api/click/route.ts:2,25` | import `@/lib/supabase/server`，直接查询 | `nav_links`（行 28-33） |
| `app/api/submit/route.ts:2,46` | import `@/lib/supabase/server`，直接 insert | `nav_links`（行 47-68） |
| `app/api/health/route.ts:2,17` | import `@/lib/supabase/server`，直接查询 | `nav_categories`（行 18-20） |
| `app/api/admin/links/route.ts:2,30,47` | import `@/lib/supabase/admin`，直接 CRUD | `nav_links` |
| `app/api/admin/links/[id]/route.ts:2,32,60` | 同上 | `nav_links` |
| `app/api/admin/categories/route.ts:2,20,37` | 同上 | `nav_categories` |
| `app/api/admin/categories/[id]/route.ts:2,20,48` | 同上 | `nav_categories` |

仅以下路由正确使用了 repository 层：`app/api/search/route.ts:2`、`app/api/reviews/route.ts:4-11`、`app/api/tools/route.ts:2`。

**影响**：
- 数据访问逻辑分散在 8+ 个文件中，无法通过修改 repositories.ts 统一切换数据源
- SQL 查询逻辑重复（如 `nav_links` 表的 select+join 在 repositories.ts、click route、submit route、admin routes 中各写一遍）
- 无法通过 mock repository 层进行单元测试

**建议**：将所有 supabase 查询收归 repositories.ts（或拆分为 `repositories/links.ts`、`repositories/categories.ts` 等子模块），API 路由仅调用 repository 函数。

---

### [🔴高] favorites API 内联 service role 客户端（安全风险）

**描述**：`app/api/favorites/route.ts:2` 直接 import `@supabase/supabase-js`（而非项目封装的 `@/lib/supabase/server`），并在行 9-16 自行创建使用 `SUPABASE_SERVICE_ROLE_KEY` 的客户端：

```typescript
// app/api/favorites/route.ts:9-16
function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing Supabase server credentials");
  }
  return createClient(url, serviceKey);
}
```

**影响**：
- service role key 客户端绕过所有 RLS 策略，若此路由存在漏洞则可直接操作任意表
- 与项目 `lib/supabase/admin.ts` 的封装不一致（admin.ts 使用 anon key + cookie），存在两套不同的权限模型
- service role key 的使用没有通过 lib 层封装，难以审计和替换

**建议**：在 `lib/supabase/` 下创建 `service.ts` 封装 service role 客户端，将 favorites 数据访问移入 repositories.ts，API 路由仅调用 repository 函数。

---

### [🔴高] next-auth 5.0.0-beta.31 在生产环境使用（供应链风险）

**描述**：`package.json:23` 声明 `"next-auth": "5.0.0-beta.31"`。lockfile 确认安装的为 `5.0.0-beta.31`（`pnpm-lock.yaml:36-37`），拉入 `@auth/core@0.41.2`（`pnpm-lock.yaml:147`）。

ADR-002（`docs/adr-002-authjs-migration.md`）记录了从 `@auth/core` canary 迁移到 next-auth v5 beta 的决策，理由是"beta 已广泛使用，API 稳定"。但 beta 版本仍存在以下风险：
- 无 semver 保证，任何小版本更新可能引入 breaking change
- beta 期间 API 可能变更，导致升级成本
- 安全漏洞修复可能延迟

**影响**：认证是系统安全的核心，beta 版本的不可预测性构成供应链风险。

**建议**：监控 next-auth v5 正式版发布（ADR-002 后续行动已记录），发布后立即升级。当前可考虑 pinning 到 beta.31 避免自动升级引入 breaking change。

---

### [🟡中] lib/model-rankings.ts 是游离的数据访问模块

**描述**：`lib/model-rankings.ts:1,7` 直接 import `./supabase/server` 并创建 supabase 客户端查询 `model_rankings` 表，未经过 repositories.ts。

```typescript
// lib/model-rankings.ts:1-7
import { createClient } from "./supabase/server";
// ...
const supabase = await createClient();
const { data, error } = await supabase.from("model_rankings").select("*")...
```

**影响**：repositories.ts 声称是"封装所有 Supabase 查询"的唯一入口，但 model-rankings.ts 打破了这一约定。数据访问点分散，难以统一管理缓存策略和数据源切换。

**建议**：将 `getModelRankings` 移入 repositories.ts，或明确 repositories.ts 的职责边界（仅管理 nav_links/nav_categories/tool_reviews 相关表）。

---

### [🟡中] repositories.ts 职责不完整（半上帝模块）

**描述**：`lib/repositories.ts`（337 行）覆盖了 categories、links、tool reviews、review stats、review rate limiting，但遗漏了：favorites（user_favorites 表）、clicks（nav_links 点击计数）、submits（nav_links 提交）、admin CRUD（nav_links/nav_categories 管理）、model rankings。

**影响**：
- 模块"声称"管所有数据访问但实际只管一半，给维护者造成错误预期
- 另一半数据访问散落在 API 路由和 model-rankings.ts 中

**建议**：要么将所有数据访问收归 repositories.ts（可能膨胀到 600+ 行，需拆分），要么将其重命名为 `public-repository.ts` 并明确职责为"仅管理公开数据的读取"。

---

### [🟡中] createAdminClient 与 createClient 实现完全相同

**描述**：对比 `lib/supabase/admin.ts` 和 `lib/supabase/server.ts`：

| 特征 | `createClient` (server.ts:5-20) | `createAdminClient` (admin.ts:12-27) |
|------|------|------|
| URL 来源 | `getSupabaseUrl()` | `getSupabaseUrl()` |
| Key 类型 | `getSupabaseKey()` (anon key) | `getSupabaseKey()` (anon key) |
| Cookie 处理 | `cookieStore.getAll()` / `setAll()` | `cookieStore.getAll()` / `setAll()` |
| createServerClient | 是 | 是 |

两者完全相同。ADR-001（`docs/adr-001-dual-db-merge.md:57`）明确记载"修改 `lib/supabase/admin.ts`，改为使用与 `server.ts` 相同的客户端"，所以这是迁移后的结果。

**影响**：
- admin 路由使用 anon key + RLS，而非 service role key。如果 admin 路由需要读取未批准的链接（`approved=false`），anon key + RLS 可能无法访问
- 两个文件维护相同逻辑，存在不一致风险

**建议**：如果 admin 确实不需要 elevated privileges，则删除 `admin.ts`，admin 路由直接使用 `createClient`。如果 admin 需要 service role key（如 ADR-001 迁移步骤所述"nav_links 表的写入仅允许认证用户"），则 admin.ts 应使用 service role key。

---

### [🟡中] 'use client' 指令用于纯工具模块

**描述**：以下文件标记了 `'use client'` 但只导出纯函数/常量，不使用任何浏览器 API 或 React hook：

| 文件 | 导出内容 | 是否需要 'use client' |
|-----|---------|---------------------|
| `lib/animations.ts:1` | 3 个 Motion `Variants` 常量（纯对象） | ❌ 不需要 |
| `lib/highlight.tsx:1` | `highlightSearchTerm` 纯函数（返回 ReactNode） | ❌ 不需要 |

**影响**：
- 这些模块被打入客户端 bundle，即使它们也可以在 Server Component 中使用
- 增加客户端 bundle 体积（虽小，但违反最佳实践）

**建议**：移除这两个文件的 `'use client'` 指令。它们只导出纯数据和纯函数，可在 Server/Client Component 中通用。

---

### [🟡中] Admin 页面使用客户端数据获取（应改为 SSR）

**描述**：`app/admin/page.tsx:1` 标记 `'use client'`，通过 `useAdminLinks` hook（`components/admin/useAdminLinks.ts:11-25`）在客户端 `fetch("/api/admin/links")` 和 `fetch("/api/admin/categories")` 获取数据。

而 `app/admin/layout.tsx:6-15` 已经是 Server Component，已通过 `auth()` 进行服务端认证检查。

**影响**：
- Admin 页面完全在客户端渲染，首屏白屏时间更长
- 数据获取需要额外的 HTTP 往返（client → API route → supabase），而非直接在 Server Component 中调用 repository

**建议**：将 admin page 改为 Server Component，直接调用 repository 函数获取数据，将需要交互的部分（编辑表单、删除按钮）提取为 Client Component 子组件。

---

### [🟡中] 登录路由重复实现密码验证逻辑

**描述**：`app/api/admin/login/route.ts:80-97` 重新实现了 timingSafeEqual 密码验证逻辑，与 `lib/auth.ts:16-23` 的 `authorize` 回调中的逻辑完全相同：

```typescript
// lib/auth.ts:16-23 (Auth.js Credentials provider)
const encoder = new TextEncoder();
const a = encoder.encode(password);
const b = encoder.encode(adminPassword);
if (a.length !== b.length) return null;
const { timingSafeEqual } = await import("crypto");
if (!timingSafeEqual(a, b)) return null;

// app/api/admin/login/route.ts:87-97 (重复实现)
const encoder = new TextEncoder();
const a = encoder.encode(password);
const b = encoder.encode(adminPassword);
if (a.length !== b.length) { /* ... */ }
const { timingSafeEqual } = await import("crypto");
const success = timingSafeEqual(a, b);
```

**影响**：密码验证逻辑存在两份副本，修改一处时可能遗漏另一处，导致认证不一致。

**建议**：将密码验证逻辑提取为 `lib/auth.ts` 中的共享函数（如 `verifyAdminPassword(password: string): Promise<boolean>`），两处调用统一引用。

---

### [🟡中] 登录路由使用不必要的动态 import

**描述**：`app/api/admin/login/route.ts:54` 使用动态 import：

```typescript
const { createClient } = await import("@/lib/supabase/server");
```

而同文件中其他模块（`@/lib/utils`、`@/lib/rate-limit`、`@/lib/logger`）都是静态 import。动态 import 在此处无性能收益（该路由始终需要 supabase 客户端），反而阻碍了 tree-shaking 和静态分析。

**影响**：代码不一致，增加理解成本，略微影响构建优化。

**建议**：改为静态 import `import { createClient } from "@/lib/supabase/server"`。

---

### [🟡中] 命名约定不一致

**描述**：项目文件命名混用两种风格：

| 目录 | 命名风格 | 示例 |
|-----|---------|------|
| `lib/` | kebab-case | `use-favorites.ts`、`rate-limit.ts`、`admin-auth.ts`、`nav-config.ts`、`model-rankings.ts`、`category-icons.ts` |
| `components/` | camelCase | `useLinksFilter.ts`、`admin/useAdminLinks.ts` |
| `lib/` (其他) | camelCase 无 | `repositories.ts`、`logger.ts`、`types.ts`、`utils.ts`、`slugify.ts`、`auth.ts`、`animations.ts` |

**影响**：开发者需要记住不同目录使用不同命名约定，增加认知负担，降低文件定位效率。

**建议**：统一为一种风格。推荐统一使用 kebab-case（Next.js 社区主流约定），将 `useLinksFilter.ts` → `use-links-filter.ts`，`useAdminLinks.ts` → `use-admin-links.ts`。

---

### [🟡中] 客户端 bundle 中包含 Fuse.js

**描述**：`components/useLinksFilter.ts:8` 在客户端 hook 中 import `fuse.js`，用于模型排行榜的客户端模糊搜索（行 13-21、243-251）。

虽然搜索 API（`app/api/search/route.ts`）已正确使用服务端 Fuse.js（避免全量数据进入客户端），但 useLinksFilter 中的客户端 Fuse.js 仍将整个库打入客户端 bundle（minified ~12KB）。

**影响**：客户端 bundle 增加 ~12KB，对于仅用于模型排行榜（数据量小）的场景性价比不高。

**建议**：可接受（模型排行榜数据量小，客户端搜索响应更快）。若需优化，可将排行榜搜索也改为 debounce + server API 调用。

---

## 二、模块耦合度

### 依赖方向分析

整体依赖方向**单向且无循环依赖**：

```
app/ (路由) → components/ (UI) → lib/ (业务逻辑) → lib/supabase/ (数据客户端)
app/ (路由) → lib/ (业务逻辑) → lib/supabase/ (数据客户端)
```

- ✅ `lib/` 不反向依赖 `components/`（Grep 验证：`lib/` 内无 `from "@/components"` import）
- ✅ `components/` 不直接依赖 `lib/supabase/`（Grep 验证：`components/` 内无 `from "@/lib/supabase"` import）
- ✅ `lib/` 内部无循环依赖（依赖链：repositories → supabase/server → supabase/config；rate-limit → supabase/server + logger；model-rankings → supabase/server + types + logger）

### [🟢低] 组件间耦合极低（高内聚低耦合）

**描述**：组件间仅有 4 处跨组件 import（Grep 验证）：

| 引用方 | 被引用方 | 用途 |
|-------|---------|------|
| `components/Header.tsx:7-9` | ThemeToggle、Shell、FavoritesProvider | 组合头部 |
| `components/LinkCard.tsx:9` | FavoritesProvider | 收藏按钮状态 |
| `components/Navigation.tsx:8-15` | SearchBar、Sidebar、Shell、useLinksFilter、DualTrackSection、CategorySection | 组合主页 |
| `components/admin/LinkForm.tsx` 等 admin 组件 | 互相引用 | 管理面板内部 |

**评价**：组件耦合度极低，大部分组件可独立使用。Navigation 作为编排组件，扇出较高（6 个依赖），但这是合理的页面级编排。

### [🟢低] lib 内部依赖图

```
repositories.ts ──→ supabase/server.ts ──→ supabase/config.ts
       │──→ types.ts (纯类型)
       │──→ slugify.ts (纯函数)
       │──→ rate-limit.ts ──→ supabase/server.ts
       │──→ logger.ts
model-rankings.ts ──→ supabase/server.ts
       │──→ types.ts
       │──→ logger.ts
admin-auth.ts ──→ auth.ts
use-favorites.ts ──→ (next-auth/react, 仅客户端)
```

核心节点（高扇入）：
- `lib/supabase/server.ts` — 被 repositories、rate-limit、model-rankings、4 个 API 路由引用
- `lib/logger.ts` — 被 repositories、rate-limit、model-rankings、多个 API 路由引用
- `lib/types.ts` — 被 repositories、model-rankings、useLinksFilter、多个组件引用

**评价**：lib 内部依赖关系清晰，无循环依赖，核心节点职责单一。

### [🟢低] API 路由之间无互相调用

**描述**：Grep 验证所有 API 路由文件，无 API 路由内部调用另一个 API 路由的函数或 fetch 另一个 API 端点的情况。各 API 路由独立运作。

### [🟢低] 共享状态（Context）使用范围合理

**描述**：项目使用两个 Context：
1. `FavoritesProvider`（`components/FavoritesProvider.tsx`）— 在 `app/layout.tsx:52` 全局提供，被 `Header.tsx` 和 `LinkCard.tsx` 消费。范围合理。
2. `Shell`（`components/Shell.tsx`）— 在 `app/layout.tsx:53` 全局提供，被 `Header.tsx` 和 `Navigation.tsx` 消费。范围合理。

无 prop drilling 问题。FavoritesProvider 全局包裹可能导致非收藏相关页面也加载收藏逻辑，但 useFavorites hook 内部有 lazy 初始化，影响可忽略。

---

## 三、依赖项健康状况

### 依赖版本概览

| 依赖 | 当前版本 | 类型 | 状态 |
|------|---------|------|------|
| next | 16.2.9 | dependencies | 最新大版本，前沿 |
| react / react-dom | 19.2.4 | dependencies | React 19 稳定版 |
| next-auth | 5.0.0-beta.31 | dependencies | 🔴 beta 版本 |
| @sentry/nextjs | ^10.59.0 | dependencies | 最新 |
| @supabase/ssr | 0.12.0 | dependencies | 正常 |
| @supabase/supabase-js | 2.108.2 | dependencies | 正常 |
| zod | ^4.4.3 | dependencies | 🟡 v4 较新，lockfile 中同时存在 v3.25.76 |
| motion | 12.40.0 | dependencies | 正常（原 framer-motion） |
| lucide-react | 1.20.0 | dependencies | 正常 |
| fuse.js | ^7.4.2 | dependencies | 正常 |
| next-themes | 0.4.6 | dependencies | 正常 |
| pangu | ^7.2.1 | dependencies | 正常 |
| sonner | 2.0.7 | dependencies | 正常 |
| clsx | 2.1.1 | dependencies | 🔴 未使用 |
| tailwind-merge | 3.6.0 | dependencies | 🔴 未使用 |
| shadcn | 4.11.0 | dependencies | 🟡 应为 devDependency |
| tw-animate-css | 1.4.0 | dependencies | 正常 |

### [🔴高] clsx 和 tailwind-merge 完全未被使用

**描述**：Grep 搜索整个项目源码（含 .ts/.tsx/.css 文件），`clsx` 和 `tailwind-merge` 均无任何 import：

- `clsx`：0 个文件引用（Grep `from "clsx"` 返回 No files found）
- `tailwind-merge`：0 个文件引用（Grep `from "tailwind-merge"` 返回 No files found）

项目也没有标准的 `cn()` 工具函数（Grep `function cn\(` 返回 No matches found），这是 shadcn/ui 项目的标配函数，通常组合 clsx + tailwind-merge。

**影响**：两个依赖（共 ~15KB gzipped）被打入生产 bundle 但完全无用，增加安装时间和 bundle 体积。

**建议**：
- 如果计划使用 shadcn/ui 组件：创建 `lib/utils.ts` 中的 `cn()` 函数并开始使用
- 如果不计划使用：从 package.json 移除这两个依赖

---

### [🟡中] shadcn CLI 工具误放在 dependencies

**描述**：`package.json:36` 将 `"shadcn": "4.11.0"` 放在 `dependencies` 中。shadcn 是一个 CLI 工具，用于脚手架生成 UI 组件代码，仅在开发时使用。lockfile 确认（`pnpm-lock.yaml:50-52`）。

项目通过 CSS import 使用 shadcn 的样式（`app/globals.css:3`: `@import "shadcn/tailwind.css"`），但这不依赖 shadcn npm 包本身（shadcn CLI 不提供运行时 CSS）。

**影响**：shadcn 及其依赖（typescript 等）被打入生产 dependencies，增加安装时间。

**建议**：将 `shadcn` 移到 `devDependencies`。如果 `@import "shadcn/tailwind.css"` 确实需要 shadcn 包在运行时存在，则需验证该 CSS import 的实际来源。

---

### [🟡中] Zod 版本重复（v3 + v4 共存）

**描述**：lockfile 中同时存在两个 zod 版本（`pnpm-lock.yaml:4347,4350`）：
- `zod@4.4.3` — 项目直接依赖（`package.json:40`）
- `zod@3.25.76` — 作为 `@modelcontextprotocol/sdk`（`pnpm-lock.yaml:4862`）和 `zod-to-json-schema`（`pnpm-lock.yaml:4880`）的传递依赖

**影响**：两个 zod 版本共存增加 node_modules 体积。如果任何代码意外 import 到 v3 版本，可能与 v4 API 不兼容。

**建议**：检查 `@modelcontextprotocol/sdk` 是否为必要依赖（项目源码中未见 import）。如非必要，移除以消除 zod 版本重复。如是 shadcn 或其他工具的传递依赖，可尝试 `pnpm overrides` 统一版本。

---

### [🟡中] 缺少 typecheck 和 format 脚本

**描述**：`package.json:6-21` 的 scripts 列表：

```json
"dev": "next dev -p 3264",
"build": "next build",
"start": "next start",
"lint": "eslint",
"test": "vitest run",
"e2e": "playwright test",
"analyze": "ANALYZE=true next build"
```

缺少：
- `typecheck` 脚本（`tsc --noEmit`）— 目前只能通过 `next build` 触发类型检查
- `format` 脚本（Prettier 等）— 无代码格式化工具
- `pre-commit` / `pre-push` git hook — 无 husky/lint-staged 配置

**影响**：类型检查只能在 `next build` 时触发，反馈链长。无格式化工具可能导致代码风格不一致。

**建议**：
- 添加 `"typecheck": "tsc --noEmit"` 脚本
- 评估是否需要 Prettier（如果团队遵守 ESLint 规则则可省略）
- 评估是否需要 lint-staged + husky 在提交前自动 lint

---

### [🟢低] @auth/core canary 残留（node_modules 中）

**描述**：node_modules 中存在三个版本的 `@auth/core`：
- `@auth/core@0.0.0-380f8d56`（canary，ADR-002 迁移前的旧版本）
- `@auth/core@0.34.3`
- `@auth/core@0.41.2`（当前 lockfile 唯一版本）

lockfile（`pnpm-lock.yaml`）中仅存在 `@auth/core@0.41.2`，说明 canary 和 0.34.3 版本是 node_modules 中的残留产物（未被 lockfile 引用）。

**影响**：无实际影响（lockfile 已正确更新），但 `pnpm prune` 或 `rm -rf node_modules && pnpm install` 可清理残留。

**建议**：执行 `rm -rf node_modules && pnpm install` 清理残留版本。

---

### [🟢低] checkout/webhook 桩路由

**描述**：`app/api/checkout/route.ts` 和 `app/api/webhook/route.ts` 均为桩路由，返回 501 状态码。两个文件各 9 行，无实际逻辑。

**影响**：增加路由数量（30 个路由中 2 个为桩），轻微增加维护成本。

**建议**：如果短期不实现付费功能，可删除这两个路由文件，在需要时重新创建。

---

## 四、构建与部署配置

### [🟢低] next.config.ts 安全头配置完善

**描述**：`next.config.ts:9-46` 配置了 6 个安全头：
- `X-Frame-Options: DENY` ✅
- `X-Content-Type-Options: nosniff` ✅
- `Referrer-Policy: strict-origin-when-cross-origin` ✅
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` ✅
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` ✅
- `Content-Security-Policy` ✅（完整策略）

**评价**：安全头配置专业且全面，覆盖所有 OWASP 推荐头。

### [🟡中] CSP 允许 unsafe-inline 和 unsafe-eval

**描述**：`next.config.ts:34` 的 CSP 策略中：
```
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com
```

- `'unsafe-inline'`：Next.js 内联脚本需要，常见但降低了 CSP 强度
- `'unsafe-eval'`：允许 `eval()`，风险较高。可能是某些库（如 Sentry 的 source map 上传）需要

**影响**：CSP 强度降低，攻击者注入的内联脚本和 eval 代码可执行。

**建议**：Next.js 16 支持 nonce-based CSP，可消除 `'unsafe-inline'`。评估是否可以移除 `'unsafe-eval'`（测试移除后 Sentry 和其他库是否正常工作）。

### [🟢低] tsconfig.json 配置合理

**描述**：`tsconfig.json` 配置：
- `strict: true` ✅ 严格模式
- `paths: { "@/*": ["./*"] }` ✅ 路径别名
- `target: "ES2017"` — 可升级到 ES2020+（Node 22 支持）
- `moduleResolution: "bundler"` ✅ 适配现代打包器
- `isolatedModules: true` ✅

**评价**：TypeScript 配置规范，strict 模式确保类型安全。`target: "ES2017"` 可升级但影响不大。

### [🟢低] ESLint 配置使用 Next.js 默认规则

**描述**：`eslint.config.mjs` 使用 `eslint-config-next/core-web-vitals` 和 `eslint-config-next/typescript`，无自定义规则，无禁用规则。

**评价**：使用 Next.js 推荐配置，覆盖核心规则。未额外配置 import 排序、命名规范等，但 0 ESLint error 说明默认规则已足够。

### [🟢低] Sentry 配置规范

**描述**：
- `sentry.client.config.ts:4` — DSN 从 `NEXT_PUBLIC_SENTRY_DSN` 环境变量读取（未硬编码）✅
- `sentry.server.config.ts:4` — DSN 从 `SENTRY_DSN || NEXT_PUBLIC_SENTRY_DSN` 读取 ✅
- `sentry.client.config.ts:16-33` — `beforeSend` 过滤已知噪音（ResizeObserver、Hydration 等）✅
- `sentry.client.config.ts:9` — 生产环境 tracesSampleRate: 0.1，开发环境 1.0 ✅
- `sentry.client.config.ts:12-13` — Session replay 仅在报错时录制 ✅
- `next.config.ts:60-68` — withSentryConfig 启用 sourcemaps ✅

**评价**：Sentry 配置专业，采样率合理，事件过滤得当。DSN 通过环境变量注入，未泄露。

### [🟢低] netlify.toml 部署配置合理

**描述**：`netlify.toml` 配置：
- 构建：`npm i -g pnpm@11.5.0 && pnpm build` ✅（与 packageManager 一致）
- Node 版本：22 ✅
- 静态资源缓存：`/_next/static/*` → `max-age=31536000, immutable` ✅
- 图片/robots/sitemap 缓存策略 ✅

**评价**：部署配置简洁有效，缓存策略合理。

---

## 五、优先级排序的优化建议

| 优先级 | 优化项 | 涉及文件:行号 | 预期效果 |
|-------|-------|-------------|---------|
| **P0** | 将 favorites API 的 service role 客户端移入 lib 层封装，消除内联 service role key 使用 | `app/api/favorites/route.ts:2,9-16` | 消除安全风险，统一数据访问入口 |
| **P0** | 将所有 API 路由的 supabase 查询收归 repository 层 | `app/api/click/route.ts:2,25`、`app/api/submit/route.ts:2,46`、`app/api/health/route.ts:2,17`、`app/api/admin/links/route.ts:2,30,47`、`app/api/admin/links/[id]/route.ts:2,32,60`、`app/api/admin/categories/route.ts:2,20,37`、`app/api/admin/categories/[id]/route.ts:2,20,48` | 统一数据访问层，可测试、可替换数据源 |
| **P0** | 监控并升级 next-auth 到 v5 正式版（发布后） | `package.json:23` | 消除供应链风险 |
| **P1** | 移除未使用依赖 clsx 和 tailwind-merge | `package.json:27,38` | 减小 bundle 体积 ~15KB，减少安装时间 |
| **P1** | 将 shadcn 移到 devDependencies | `package.json:36` | 减少生产依赖 |
| **P1** | 提取共享密码验证函数，消除重复逻辑 | `lib/auth.ts:16-23`、`app/api/admin/login/route.ts:87-97` | 消除代码重复，降低维护风险 |
| **P1** | 将 model-rankings.ts 数据访问移入 repository 层 | `lib/model-rankings.ts:1,7` | 统一数据访问入口 |
| **P1** | 添加 `typecheck` 脚本 | `package.json:6-21` | 加快类型错误反馈 |
| **P1** | 评估 createAdminClient 的必要性（与 createClient 相同） | `lib/supabase/admin.ts:12-27` | 消除冗余代码 |
| **P2** | 移除 lib/animations.ts 和 lib/highlight.tsx 的 'use client' | `lib/animations.ts:1`、`lib/highlight.tsx:1` | 允许 Server Component 使用，减小客户端 bundle |
| **P2** | 将 admin page 改为 Server Component + Client 子组件 | `app/admin/page.tsx:1`、`components/admin/useAdminLinks.ts:11-25` | 改善首屏性能 |
| **P2** | 统一文件命名约定（kebab-case） | `components/useLinksFilter.ts`、`components/admin/useAdminLinks.ts` | 提升代码一致性 |
| **P2** | 尝试移除 CSP 中的 'unsafe-eval' | `next.config.ts:34` | 增强 CSP 安全性 |
| **P2** | 消除登录路由中的动态 import | `app/api/admin/login/route.ts:54` | 改善构建优化 |
| **P2** | 清理 zod 版本重复 | `pnpm-lock.yaml:4347,4350` | 减少 node_modules 体积 |
| **P2** | 清理 node_modules 残留 @auth/core 版本 | `node_modules/` | 清洁依赖树 |
| **P2** | 删除 checkout/webhook 桩路由 | `app/api/checkout/route.ts`、`app/api/webhook/route.ts` | 减少路由数量 |

---

## 附录：分析方法

1. 使用 Glob 枚举所有源文件（app/ 36、components/ 30、lib/ 18）
2. 使用 Grep 搜索关键模式：`'use client'`、`from "@/lib/supabase"`、`createClient`、各依赖包名
3. 使用 Read 逐文件审读：package.json、next.config.ts、tsconfig.json、eslint.config.mjs、netlify.toml、sentry.*.config.ts、所有 lib/ 文件、所有 API 路由、关键组件
4. 使用 Read 审阅 ADR 文档（adr-001、adr-002）了解架构决策背景
5. 使用 Read 审阅 pnpm-lock.yaml 验证依赖版本与传递依赖
