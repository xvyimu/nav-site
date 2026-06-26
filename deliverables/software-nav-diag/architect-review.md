# 架构与依赖诊断报告（架构师 · 高见远）

> 项目：nav-site（综合导航站）　|　路径：`D:\nav-site`　|　日期：2026-06-24
> 技术栈：Next.js 16.2.9 (App Router + Turbopack) · React 19.2.4 · Tailwind v4 · shadcn/ui · Supabase PostgreSQL (单库+RLS) · next-auth v5 beta · Fuse.js · Motion · Sentry · Vitest · Playwright
> 诊断方式：只读分析（Read/Grep/Glob/Bash），未修改任何源代码

---

## 执行摘要

nav-site 整体架构清晰、工程化程度高：`app / components / lib` 三层分层基本到位，App Router 的 Server/Client Component 边界划分合理，数据读访问通过 `lib/repositories.ts` + React `cache()` 统一抽象且 ISR 缓存策略得当，认证使用 next-auth v5 + middleware(`proxy.ts`) 双重防护，安全头/CSP/速率限制/恒定时间密码比较等安全实践到位。未发现 lib/ 与 components/ 间的循环依赖。

但存在 **5 个高严重度问题** 与若干中低问题，集中在三方面：(1) **数据访问分层名存实亡**——`repositories.ts` 注释声称"API 路由不直接调用 Supabase"，但所有写操作（admin CRUD / submit / click / favorites）均绕过该层直接操作 Supabase 客户端，其中 `/api/favorites` 更是唯一使用 `service_role_key` 绕过 RLS 的路由；(2) **认证逻辑四处重复**——middleware、Auth.js `authorized` 回调、`requireAdmin`、admin layout 各检一次，密码校验也在 login API 与 Credentials provider 两处并存；(3) **依赖项归类不当**——`shadcn`（CLI 工具）被放入运行时 `dependencies`，`next-auth` 仍为 beta 版。此外存在双库合并遗留的死代码（`lib/supabase/admin.ts`）、hook 命名/位置不统一、组件重复代码等可维护性问题。

**严重问题统计**：🔴高 5 项 · 🟡中 7 项 · 🟢低 6 项。

---

## 一、架构合理性

### [🔴高] API 路由大量绕过 repositories.ts 直接操作 Supabase

**问题描述**：`lib/repositories.ts:9-12` 注释明确声明"页面组件和 API 路由通过此层访问数据，不直接调用 Supabase"。但实际上该层仅封装了**公开数据的读操作**（分类、已批准链接、评价读取），所有**写操作**与部分读操作均在 API 路由内直接实例化 Supabase 客户端，分层约定名存实亡。

**涉及文件:行号**（均通过实际读取确认）：
- `app/api/admin/links/route.ts:30,47` — `createAdminClient()` 后直接 `.from("nav_links").insert/select`
- `app/api/admin/links/[id]/route.ts:32,60` — `createAdminClient()` 后直接 `.update/.delete`
- `app/api/admin/categories/route.ts:20,37` — `createAdminClient()` 后直接 `.insert/select`
- `app/api/admin/categories/[id]/route.ts:20,48` — `createAdminClient()` 后直接 `.update/.delete`
- `app/api/admin/login/route.ts:54-55` — `createClient()` 后操作 `login_attempts` 表
- `app/api/click/route.ts:25` — `createClient()` 后 `.from("nav_links").select` 校验链接存在
- `app/api/submit/route.ts:46-68` — `createClient()` 后 `.select` 去重 + `.insert` 提交
- `app/api/favorites/route.ts:15` — 见下一条独立问题
- `app/api/health/route.ts:17` — `createClient()` 后 `.from("nav_categories").select`

**影响**：数据访问逻辑分散在 9 个路由文件中，无法统一替换数据源、加缓存、做审计日志或统一错误处理；`repositories.ts` 作为"数据获取层"的抽象价值被削弱一半。

**建议**：将 admin CRUD、submit、click、favorites 的数据操作下沉到 `repositories.ts`（或拆分为 `repositories/links.ts`、`repositories/categories.ts`、`repositories/favorites.ts`），API 路由仅负责鉴权、输入校验与调用。

---

### [🔴高] /api/favorites 使用 service role key 绕过 RLS 与统一封装

**问题描述**：`app/api/favorites/route.ts` 是全项目唯一使用 Supabase `service_role_key` 的路由，它直接 `import { createClient } from "@supabase/supabase-js"`（行 2）并手动构造带 service role 的客户端（行 9-16），完全绕过了 `lib/supabase/server.ts` 封装与 RLS 策略。

**涉及文件:行号**：
- `app/api/favorites/route.ts:2` — `import { createClient } from "@supabase/supabase-js";`
- `app/api/favorites/route.ts:9-16` — `getServerClient()` 读取 `SUPABASE_SERVICE_ROLE_KEY` 创建绕过 RLS 的客户端
- `app/api/favorites/route.ts:27,63,99` — GET/POST/DELETE 三个方法均使用该客户端

**影响**：
1. **安全面扩大**：service role key 绕过所有 RLS，该路由的鉴权（仅检查 `session?.user`，行 21/50/89）一旦失效，将暴露 `user_favorites` 全表读写；
2. **架构不一致**：与其他路由（用 `createClient`/`createAdminClient` + anon key + RLS）形成两套数据访问模式；
3. **密钥管理分散**：service role key 的使用未集中管控。

**建议**：收藏的写入本可依赖 RLS（`user_favorites` 表按 `auth.uid()` 限制行级访问），应改用 `lib/supabase/server.ts` 的 `createClient()`（携带用户 cookie 的 anon 客户端），让 RLS 自动过滤；确需 service role 的操作应集中到 `lib/supabase/admin.ts` 统一管控。

---

### [🔴高] 认证/鉴权逻辑四处重复，存在不一致风险

**问题描述**：同一套"admin 路由需管理员权限"的鉴权逻辑在 4 处独立实现，维护时极易遗漏其一导致不一致。

**涉及文件:行号**：
1. `proxy.ts:4-22` — middleware `auth()` 包装，检查 `/admin`、`/api/admin/`、`/login`（matcher 见行 32-34）
2. `lib/auth.ts:39-48` — Auth.js `authorized()` 回调，**再次**检查 `/admin`、`/api/admin/` 的 admin role（与 proxy.ts 语义重叠）
3. `lib/admin-auth.ts:8-18` — `requireAdmin()` 在每个 admin API handler 内部二次确认
4. `app/admin/layout.tsx:11-15` — admin 页面 layout 内又一次 `auth()` + `redirect`

**影响**：4 处鉴权逻辑，其中 proxy.ts 与 `authorized()` 回调职责完全重叠（Next.js v5 中 middleware 已基于 `auth()` 执行 `authorized`，二者叠加属冗余）；任一处规则变更未同步将产生安全缝隙或误拒。

**建议**：保留 middleware(`proxy.ts`) 作为路由级守卫 + `requireAdmin()` 作为 handler 内防御性二次校验；移除 `authorized()` 回调中的重复判断（或将其简化为仅处理 `/login` 重定向），admin layout 可信任 middleware 已拦截而移除重复 `auth()`。

---

### [🔴高] /api/admin/login 手动构造 JWT，与 Auth.js signIn 形成双登录路径

**问题描述**：`app/api/admin/login/route.ts` 没有调用 Auth.js 的 `signIn`，而是用 `next-auth/jwt` 的 `encode` 手动生成 session-token cookie（行 40-49, 107-117），自建了一套登录流程。同时 `lib/auth.ts:7-27` 的 Credentials provider `authorize` 又实现了**相同的密码校验逻辑**（timingSafeEqual 比较 ADMIN_PASSWORD）。项目因此存在两套并行的管理员登录/密码校验路径。

**涉及文件:行号**：
- `app/api/admin/login/route.ts:40-49` — `createSessionCookie()` 手动 `encode({ token: { sub:"admin", role:"admin" }, secret, salt, maxAge })`
- `app/api/admin/login/route.ts:87-97` — 内联 timingSafeEqual 密码校验
- `app/api/admin/login/route.ts:107-117` — 手动 `response.cookies.set("next-auth.session-token", ...)`
- `lib/auth.ts:7-27` — Credentials provider `authorize` 内**同样的** timingSafeEqual 密码校验
- `app/login/page.tsx:18-22` — 前端登录页仅调用 `/api/admin/login`（走自建路径）

**影响**：两套密码校验逻辑并存，未来调整密码策略（如改哈希、加 2FA）需同步两处；手动构造 JWT 绕过 Auth.js 的 session 管理与事件钩子，存在 token 格式与官方不一致的长期风险。

**建议**：统一为 Auth.js `signIn("credentials", ...)` 单一路径，移除 `/api/admin/login` 的手动 JWT 构造；登录速率限制可保留在 Credentials provider 内或通过 middleware 实现。

---

### [🟡中] FavoritesPage 向客户端下发全量链接数据

**问题描述**：收藏页是 Server Component，但为在客户端按 `favoriteIds` 过滤，它获取了全部 500+ 已批准链接并整体下发给客户端组件。

**涉及文件:行号**：
- `app/favorites/page.tsx:8` — `const links = await getApprovedLinks();`（全量 500+ 条）
- `app/favorites/page.tsx:9` — `<FavoritesView allLinks={links as NavLink[]} />`
- `app/favorites/FavoritesView.tsx:12` — `const links = allLinks.filter((l) => favoriteIds.includes(l.id));`（客户端过滤）

**影响**：500+ 条完整链接对象序列化进 RSC payload 传输到客户端，仅为过滤几十个收藏项；首屏体积膨胀，移动端尤其明显。

**建议**：收藏 ID 已在客户端（localStorage + `/api/favorites`），可在客户端直接按 ID 调 `/api/tools` 或新增按 ID 批量查询端点获取收藏详情，避免下发全量数据。

---

### [🟢低] 部分 lib 文件带 "use client"，客户端逻辑混入数据层目录

**问题描述**：`lib/` 主体是服务端数据访问与类型定义，但两个纯客户端 UI 辅助文件也放在此处并标 `"use client"`。

**涉及文件:行号**：
- `lib/animations.ts:1` — `"use client"`，仅导出 motion `Variants` 静态对象（标 "use client" 非必要，对象本身可在服务端使用）
- `lib/highlight.tsx:1` — `"use client"`，使用 `createElement` 做搜索高亮（纯客户端渲染辅助）

**影响**：lib/ 目录职责混杂（服务端数据访问 + 客户端 UI 辅助），认知负担略增；`animations.ts` 的 "use client" 标注无实际必要。

**建议**：将二者移至 `components/` 或新建 `lib/client/`；`animations.ts` 可去掉 "use client"（Variants 为纯数据）。

---

## 二、模块耦合度

### [🟡中] repositories.ts 承担过多职责，趋向"上帝文件"

**问题描述**：`lib/repositories.ts` 共 337 行，混合了 6 个不同领域的数据访问：分类查询、链接查询、slug 查询、相关链接、Agent API 数据、**评价 CRUD**、**评价速率限制**。其中评价速率限制（`checkReviewRateLimit`/`recordReviewAttempt`）本应属于 `lib/rate-limit.ts`，却放在 repositories 中。

**涉及文件:行号**：
- `lib/repositories.ts:322-336` — `checkReviewRateLimit`/`recordReviewAttempt`（速率限制逻辑错置于数据访问层）
- `lib/repositories.ts:238-317` — 评价 CRUD（getToolReviews/getReviewStats/hasUserReviewed/createReview）
- `lib/rate-limit.ts:38-82` — 通用 `checkRateLimit`/`recordAttempt`（评价速率限制应复用此通用实现而非另起）

**影响**：单文件过大且跨领域，修改评价相关逻辑需同时理解 repositories 与 rate-limit 两处；评价速率限制未复用 `rate-limit.ts` 的通用实现，存在逻辑重复。

**建议**：按领域拆分为 `repositories/links.ts`、`repositories/categories.ts`、`repositories/reviews.ts`；评价速率限制统一走 `lib/rate-limit.ts` 的 `checkRateLimit("review_rate_limits", ...)`。

---

### [🟡中] DualTrackSection 与 CategorySection 渲染逻辑高度重复

**问题描述**：两个组件都渲染"grid + motion.div 包裹的 LinkCard + 键盘导航 props"，结构几乎一致，仅标题装饰与 section 偏移计算不同。

**涉及文件:行号**：
- `components/DualTrackSection.tsx:40-58`（Featured grid）与 `components/CategorySection.tsx:47-65`（Category grid）的 motion.div + 键盘导航属性完全相同
- 两者均接收 `focusedIndex / onFocusChange / onKeyDown / searchQuery` 同一组 props 透传给 LinkCard

**影响**：约 80 行重复代码，grid 样式或键盘导航逻辑调整需同步两处，易遗漏。

**建议**：抽取一个 `LinkGrid`（或 `ResultGrid`）组件接收 `links / offset / navProps`，DualTrackSection 与 CategorySection 复用之，仅在外层包裹不同标题。

---

### [🟢低] isSafeUrl 与 IP 提取逻辑多处内联重复

**问题描述**：`lib/utils.ts` 已提供 `isSafeUrl` 与 `getClientIp`，但部分路由/组件内联重写了相同逻辑。

**涉及文件:行号**：
- `lib/utils.ts:12-19` — `isSafeUrl`（权威实现）
- `app/api/admin/links/route.ts:11-17` — 内联 http/https `refine` 校验，未复用 `isSafeUrl`
- `components/ModelRanking.tsx:81-86` — 内联 `new URL` 协议检查，未复用 `isSafeUrl`
- `lib/utils.ts:36-42` — `getClientIp`（权威实现）
- `app/api/reviews/route.ts:71-74` — 内联 `x-nf-client-connection-ip` / `x-forwarded-for` 提取，未复用 `getClientIp`

**影响**：小幅重复，IP 提取逻辑变更需同步多处。

**建议**：统一复用 `lib/utils.ts` 的工具函数。

---

### [🟢低] 循环依赖检查：未发现

**检查方法**：通过 Grep 提取 lib/ 与 components/ 所有内部 import 构建依赖图。

**结论**：
- `lib/` 依赖图为清晰 DAG：`types / logger / slugify / utils` 为底层无内部依赖；`auth ← admin-auth`；`supabase/config ← supabase/server / supabase/admin ← rate-limit / repositories / model-rankings`，无环。
- `components/` 依赖为树形：`LinkCard ← CategorySection / DualTrackSection ← Navigation`；`Header → ThemeToggle / Shell / FavoritesProvider`，无环。

---

## 三、依赖项健康

| 依赖名 | 当前版本 | 问题类型 | 严重等级 | 建议 |
|--------|---------|---------|---------|------|
| `next-auth` | 5.0.0-beta.31 | beta 版本，无 semver 稳定保证 | 🔴高 | ADR-002 已记录决策；监控 v5 正式版发布后升级，beta 期间锁定版本避免意外升级 |
| `shadcn` | 4.11.0 | CLI 工具误置为运行时 `dependencies` | 🔴高 | 它是 CLI（`bin`/无 `main`/description "Add components to your apps"），源码无 `import "shadcn"`，仅 `app/globals.css:3` 构建时 `@import "shadcn/tailwind.css"`。移至 `devDependencies`（构建时需要，运行时不需要） |
| `lucide-react` | 1.20.0 | 版本略旧（**非异常**） | 🟢低 | 已确认是 lucide-icons/lucide 官方包（homepage lucide.dev），lucide-react 已进入 1.x 大版本；npm 最新 1.21.0，peerDeps 支持 react 19。升级到 1.21.0 即可（任务描述中"正常应为 0.x"的判断已过时） |
| `@next/bundle-analyzer` | ^16.2.9 | 版本对齐良好 | 🟢低 | 与 `next@16.2.9` 对齐，无需处理 |
| `eslint-config-next` | 16.2.9 | 版本对齐良好 | 🟢低 | 与 `next@16.2.9` 对齐，无需处理 |
| `react` / `react-dom` | 19.2.4 | 版本对齐良好 | 🟢低 | 与 `@types/react@^19` / `@types/react-dom@^19` 对齐 |
| `@supabase/ssr` / `@supabase/supabase-js` | 0.12.0 / 2.108.2 | 无问题 | 🟢低 | 用途明确，版本合理 |
| `tw-animate-css` | 1.4.0 | 无问题 | 🟢低 | `app/globals.css:2` 引入，提供动画工具类，正常 |
| `pangu` | ^7.2.1 | 无问题 | 🟢低 | `components/PanguSpacing.tsx:23` 动态 `import("pangu/browser")`，正常 |
| `motion` | 12.40.0 | 无问题 | 🟢低 | 9 个组件使用，正常 |
| `zod` / `fuse.js` / `sonner` / `next-themes` / `tailwind-merge` / `clsx` | 各版本 | 无冗余/无重叠 | 🟢低 | 各司其职，无功能重叠包 |
| `@sentry/nextjs` | ^10.59.0 | 无问题 | 🟢低 | 三份 sentry config 正常配置 |

**依赖总结**：无功能重叠的冗余包；无 `devDependencies` 误放 `dependencies` 的情况（`shadcn` 是反向问题——构建工具误放运行时依赖）；lockfile `pnpm-lock.yaml` 与 `package.json` 一致；无 `@auth/core`/`@auth/nextjs` 旧包残留（ADR-002 迁移已清理干净）。

---

## 四、代码组织

### [🟡中] Hook 文件位置与命名风格不一致，违反 components.json 自身约定

**问题描述**：项目有 3 个自定义 hook，但散落在两个目录、使用两种命名风格，且 `components.json` 声明的 `@/hooks` 别名指向不存在的目录。

**涉及文件:行号**：
- `lib/use-favorites.ts` — kebab-case，放在 `lib/`
- `components/useLinksFilter.ts` — camelCase，放在 `components/`
- `components/admin/useAdminLinks.ts` — camelCase，放在 `components/admin/`
- `components.json:20` — `"hooks": "@/hooks"`，但项目**无 `hooks/` 目录**（已用 `ls` 确认）

**影响**：hook 查找困难（需在 lib/ 与 components/ 两处搜索），命名风格不统一，违反 `components.json` 自身声明的约定。

**建议**：统一为 `hooks/` 目录 + camelCase（`hooks/use-favorites.ts` 等），并修正 `components.json` 别名指向，或统一放 `lib/hooks/`。

---

### [🟡中] lib/supabase/admin.ts 为双库架构合并后的死代码

**问题描述**：ADR-001 已将双库合并为单库，但 `lib/supabase/admin.ts` 的 `createAdminClient` 与 `lib/supabase/server.ts` 的 `createClient` 实现**完全相同**（同 URL、同 anon key、同 cookie 处理），是双库时代的遗留产物。

**涉及文件:行号**：
- `lib/supabase/admin.ts:12-27` — `createAdminClient()` 实现
- `lib/supabase/server.ts:5-20` — `createClient()` 实现（二者逐行相同）
- `lib/supabase/admin.ts:8-11` — 注释仍写"管理员 Supabase 客户端（单库模式）...ADR-001 已合并双库"，自承已无实质差异
- 引用方：`app/api/admin/links/route.ts:2`、`[id]/route.ts:2`、`categories/route.ts:2`、`[id]/route.ts:2` 共 4 处 import

**影响**：冗余抽象，4 个路由引用它但行为与 `createClient` 无异，增加认知负担与维护成本；新成员易误以为 admin 客户端有特殊权限。

**建议**：删除 `lib/supabase/admin.ts`，4 个 admin 路由改用 `createClient`（单库模式下 RLS + Auth.js session 已保证安全，ADR-001 已论证）。

---

### [🟢低] JSON-LD 转义逻辑两处实现不一致

**问题描述**：`lib/utils.ts` 已提供 `escapeJsonForHtml`，但 `app/layout.tsx` 内联手写了简化版转义，未复用工具函数。

**涉及文件:行号**：
- `lib/utils.ts:50-57` — `escapeJsonForHtml`（转义 `< > & \u2028 \u2029`，完整版）
- `app/tool/[slug]/page.tsx:115` — **正确复用** `escapeJsonForHtml`
- `app/layout.tsx:80` — 内联 `.replace(/</g,"\\u003c").replace(/>/g,"\\u003e").replace(/&/g,"\\u0026")`，**缺少 `\u2028`/`\u2029` 转义**且未复用工具函数

**影响**：layout.tsx 的内联版本少了行分隔符转义（虽实际风险低），且风格不统一。

**建议**：`app/layout.tsx:80` 改用 `escapeJsonForHtml`。

---

### [🟢低] 占位/空目录与一次性脚本

**涉及文件**：
- `.uploads/` — 空目录（可能是临时上传残留），建议确认后删除或加入 `.gitignore`
- `app/api/checkout/route.ts` / `app/api/webhook/route.ts` — Stripe 占位路由（返回 501），属有意保留，可加注释说明启用条件
- `scripts/dedupe-figma-api.mjs`、`scripts/bulk-sites.json`、`scripts/seed-data.json` — 一次性/数据脚本，保留在 `scripts/` 合理

**影响**：轻微，主要是 `.uploads/` 空目录的整洁度。

---

### [🟢低] Server/Client Component 边界总体规范

**正面评价**：
- `app/page.tsx` 为 Server Component，数据在服务端获取后传入 `Navigation`（client），边界清晰
- `app/tool/[slug]/page.tsx` 为 Server Component，`ReviewSection`（client）独立加载评价数据，未污染服务端渲染
- 动态导入得当：`MobileNav`、`ModelRanking` 用 `dynamic({ ssr:false })` 按需加载（`components/Navigation.tsx:18-29`）
- `app/layout.tsx:14-15` 用 `dynamic` 延迟加载 `ShortcutPanel`/`Toaster`

**唯一可优化点**：`app/admin/page.tsx:1` 整页 `"use client"`（含数据获取），可考虑改为 Server Component 获取首屏数据 + client 交互子组件，但 admin 页面非首屏关键路径，优先级低。

---

## 五、优先级排序的架构优化建议

| 优先级 | 优化项 | 涉及文件 | 预期效果 |
|--------|--------|---------|---------|
| P0 | `/api/favorites` 改用 `createClient`（anon+RLS），移除 service role key 直连 | `app/api/favorites/route.ts` | 收敛 service role key 使用面，消除绕过 RLS 的安全风险 |
| P0 | 将 admin CRUD / submit / click 数据操作下沉到 repositories 层 | `app/api/admin/**`、`app/api/submit/route.ts`、`app/api/click/route.ts`、`lib/repositories.ts` | 真正落实"统一数据访问层"约定，便于统一缓存/审计/错误处理 |
| P0 | 删除 `lib/supabase/admin.ts` 死代码，admin 路由改用 `createClient` | `lib/supabase/admin.ts`、4 个 admin API 路由 | 消除双库合并遗留冗余，降低认知负担 |
| P1 | 统一登录路径为 Auth.js `signIn`，移除 `/api/admin/login` 手动 JWT 构造 | `app/api/admin/login/route.ts`、`lib/auth.ts`、`app/login/page.tsx` | 消除双密码校验/双登录路径，避免 token 格式长期漂移风险 |
| P1 | 精简认证重复：移除 `authorized()` 回调与 admin layout 的重复 `auth()` | `lib/auth.ts`、`app/admin/layout.tsx`、`proxy.ts` | 鉴权逻辑单一来源，降低不一致风险 |
| P1 | `shadcn` 从 `dependencies` 移至 `devDependencies` | `package.json` | 语义正确，避免生产部署装入 CLI 工具 |
| P1 | FavoritesPage 改为按收藏 ID 查询，避免下发全量 500+ 链接 | `app/favorites/page.tsx`、`app/favorites/FavoritesView.tsx` | 首屏 payload 显著缩小，移动端体验提升 |
| P2 | 抽取 `LinkGrid` 复用组件，消除 DualTrackSection/CategorySection 重复 | `components/DualTrackSection.tsx`、`components/CategorySection.tsx` | 减少 ~80 行重复代码，UI 调整单点维护 |
| P2 | 按领域拆分 repositories.ts，评价速率限制统一走 rate-limit.ts | `lib/repositories.ts`、`lib/rate-limit.ts` | 降低单文件复杂度，职责单一 |
| P2 | 统一 hook 目录与命名风格，修正 components.json 别名 | `lib/use-favorites.ts`、`components/useLinksFilter.ts`、`components/admin/useAdminLinks.ts`、`components.json` | 一致性与可发现性提升 |
| P2 | 统一复用 `isSafeUrl` / `getClientIp` / `escapeJsonForHtml` | `app/api/admin/links/route.ts`、`components/ModelRanking.tsx`、`app/api/reviews/route.ts`、`app/layout.tsx` | 消除内联重复，工具函数单一来源 |
| P2 | 监控 next-auth v5 正式版发布并升级；lucide-react 升至 1.21.0 | `package.json` | 摆脱 beta 供应链风险，依赖保持新鲜 |

---

*报告完。所有结论均基于实际读取的源代码，已附文件:行号证据。诊断过程未修改任何源代码。*
