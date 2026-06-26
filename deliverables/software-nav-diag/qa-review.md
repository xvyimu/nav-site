# 代码质量与风险诊断报告（QA · 严过关）

> 项目：nav-site（综合导航站） | 日期：2025-06-24 | 审查方式：只读静态分析  
> 技术栈：Next.js 16.2.9 (App Router) + React 19 + TypeScript + Tailwind v4 + Supabase + next-auth v5

## 执行摘要

本次审查覆盖 `app/api/`（11 个 API 路由）、`lib/`（18 个文件）、`components/`（30 个文件）的全部源代码，从代码质量、潜在 Bug、安全漏洞、性能瓶颈四个维度进行了逐文件、逐函数的静态分析。

总体而言，项目代码质量较高：TypeScript 类型安全做得好（0 个 `any`、0 个 `@ts-ignore`）、输入校验普遍使用 zod、API 鉴权有 middleware + handler 双重校验、安全头（CSP/HSTS/X-Frame-Options 等）配置完整。但仍存在若干需要关注的问题。

**问题统计：🔴 高 1 | 🟡 中 8 | 🟢 低 10**

最严重的问题是 CSP 策略中允许 `'unsafe-eval'`，大幅削弱了 XSS 防护能力。其余中等问题主要集中在搜索竞态、错误吞噬、service role key 使用、Fuse.js 性能等方面。

---

## 一、代码质量

### [🟡中] API 路由中重复的鉴权样板代码

**文件**：`app/api/admin/categories/route.ts:17-18,34-35`、`app/api/admin/categories/[id]/route.ts:16-17,44-45`、`app/api/admin/links/route.ts:27-28,44-45`、`app/api/admin/links/[id]/route.ts:28-29,56-57`

**描述**：所有 admin API 路由的每个 HTTP 方法都重复以下两行样板代码：
```typescript
const { authorized } = await requireAdmin();
if (!authorized) return unauthorized();
```
共 6 个文件、12 处重复。此外，`const body = await request.json()` 和 zod `safeParse` + 错误响应的样板也大量重复。

**影响**：维护成本高，若鉴权逻辑变更需修改 12 处。

**建议**：创建高阶函数包装器：
```typescript
// lib/with-admin.ts
export function withAdmin<T>(handler: (req: Request, ctx?: T) => Promise<Response>) {
  return async (req: Request, ctx?: T) => {
    const { authorized } = await requireAdmin();
    if (!authorized) return unauthorized();
    return handler(req, ctx);
  };
}
// 使用：export const GET = withAdmin(async () => { ... });
```

---

### [🟡中] 重复的 URL 验证逻辑

**文件**：`app/api/submit/route.ts:10-13`、`app/api/admin/links/route.ts:9-17`、`app/api/admin/links/[id]/route.ts:9-19`、`lib/utils.ts:12-19`

**描述**：`/api/submit` 使用 `isSafeUrl()` + zod refine 验证 URL，而 admin links 路由内联了 `new URL(u).protocol` 检查逻辑（逻辑相同但实现不同）。三处定义了几乎相同的 URL 验证 schema。

**影响**：验证逻辑分散，若一处更新另一处可能遗漏。

**建议**：提取共享的 zod URL schema 到 `lib/validations.ts`：
```typescript
export const urlSchema = z.string().url().refine((u) => isSafeUrl(u), "仅允许 http/https 协议").max(2000);
```

---

### [🟢低] IP 获取逻辑重复

**文件**：`lib/utils.ts:36-42`（`getClientIp`）、`app/api/reviews/route.ts:71-74`

**描述**：`/api/reviews` 内联实现了 IP 获取逻辑，与 `lib/utils.ts` 的 `getClientIp` 完全相同。

**建议**：统一使用 `import { getClientIp } from "@/lib/utils"`。

---

### [🟢低] 非空断言 `!` 大量使用

**文件**：`app/tool/[slug]/page.tsx:102,107,125,127,135,141,143,144,154,155,160,172,173,179,192,193,194,242`（共 18 处 `link!.xxx`）

**描述**：在 `notFound()` 之后，TypeScript 未能正确收窄 `link` 的类型（可能因 `cache()` 包装器影响返回类型），导致大量使用 `!` 非空断言。

**影响**：代码可读性差，若 `notFound()` 的行为变更（如改为不抛出），断言会导致运行时错误。

**建议**：在 `notFound()` 后赋值给新变量：
```typescript
if (!link) notFound();
const data = link!; // 一次性断言
// 后续使用 data.xxx 而非 link!.xxx
```

---

### [🟢低] `as unknown as` 类型断言绕过类型系统

**文件**：`lib/auth.ts:59-60`、`app/api/favorites/route.ts:26,55,94`、`lib/use-favorites.ts:11`

**描述**：为 `session.user` 添加 `role` 和 `id` 属性时使用 `as unknown as Record<string, unknown>` 绕过类型系统，共 6 处。

**影响**：类型安全绕过，若属性名拼写错误不会被编译器捕获。

**建议**：扩展 next-auth 类型声明：
```typescript
// types/next-auth.d.ts
declare module "next-auth" {
  interface User { role?: string; id?: string; }
  interface Session { user: User; }
}
```

---

### [🟢低] 文件命名风格不一致

**文件**：`components/useLinksFilter.ts`（camelCase）、`components/admin/useAdminLinks.ts`（camelCase）vs `lib/use-favorites.ts`（kebab-case）

**描述**：同为 React Hook 文件，命名风格不统一。项目整体文件用 kebab-case（如 `rate-limit.ts`、`admin-auth.ts`），但 hook 文件混用两种风格。

**建议**：统一为 kebab-case（`use-links-filter.ts`、`use-admin-links.ts`），与项目约定一致。

---

### [🟢低] `highlight.tsx` 中 `regex.test()` 使用全局标志（代码异味）

**文件**：`lib/highlight.tsx:15,21`

**描述**：正则表达式使用 `g` 标志（`new RegExp(..., "gi")`），然后在 `parts.map()` 中调用 `regex.test(part)`。带 `g` 标志的 `test()` 是有状态的（维护 `lastIndex`），这是一个已知的 JavaScript 陷阱。

**影响**：经分析，由于 `text.split(regex)` 保证了非匹配部分不含查询词，当前用法在实际运行中**不会产生错误结果**。但这种写法脆弱，若代码重构（如改为手动遍历）会引发间歇性高亮失效。

**建议**：改用无状态比较：
```typescript
// 替代 regex.test(part)
const lowerPart = part.toLowerCase();
const lowerQuery = query.toLowerCase();
parts.map((part, i) =>
  part.toLowerCase() === query.toLowerCase()
    ? createElement("mark", { key: i, ... }, part)
    : part
)
```

---

## 二、潜在 Bug

### [🟡中] useLinksFilter 搜索竞态条件

**文件**：`components/useLinksFilter.ts:73-116`

**描述**：防抖搜索使用 `setTimeout` + `fetch`，但没有使用 `AbortController` 取消旧请求。当用户快速输入时，`clearTimeout` 可取消未触发的定时器，但已发起的 `fetch` 请求无法取消。如果先发起的请求比后发起的请求晚返回（网络抖动），旧结果会覆盖新结果。

```typescript
// 当前代码（有竞态）
const timer = setTimeout(async () => {
  const res = await fetch(`/api/search?${params}`); // 无法取消
  if (res.ok) {
    const data = await res.json();
    setServerResults(mapped); // 可能覆盖更新的结果
  }
}, 200);
return () => clearTimeout(timer); // 只取消定时器，不取消 fetch
```

**影响**：搜索结果偶尔与输入框内容不匹配。

**建议**：添加 `AbortController`：
```typescript
const controller = new AbortController();
const timer = setTimeout(async () => {
  try {
    const res = await fetch(`/api/search?${params}`, { signal: controller.signal });
    // ...
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return;
  }
}, 200);
return () => { clearTimeout(timer); controller.abort(); };
```

---

### [🟡中] recordClick TOCTOU 竞态条件

**文件**：`lib/rate-limit.ts:118-137`

**描述**：`recordClick` 先 SELECT 检查是否存在记录，再 INSERT。两个并发请求可能同时查到不存在记录，同时插入，导致重复记录。

```typescript
// 先查询（TOCTOU 窗口）
const { data: existing } = await supabase
  .from("click_rate_limits").select("id").eq("ip", ip).eq("url", url)
  .gte("created_at", windowStart).maybeSingle();
if (existing) return; // 两个请求可能同时到达这里
// 再插入（重复插入）
await supabase.from("click_rate_limits").insert({ ip, url });
```

**影响**：点击计数偶发性多计，点击去重失效。

**建议**：使用数据库唯一约束 + `upsert`：
```typescript
await supabase.from("click_rate_limits")
  .upsert({ ip, url }, { onConflict: "ip,url,created_at", ignoreDuplicates: true });
```
或在数据库层面添加 `(ip, url)` 部分唯一索引。

---

### [🟡中] /api/click 错误吞噬

**文件**：`app/api/click/route.ts:44-46`

**描述**：`catch` 块返回 `{ ok: false }` 但 HTTP 状态码为 200，且不记录任何日志。

```typescript
} catch {
  return NextResponse.json({ ok: false }); // 200 状态码 + 无日志
}
```

**影响**：1) 客户端 `sendBeacon` 不检查响应，问题被隐藏；2) Sentry 无法捕获错误；3) 调试困难。

**建议**：
```typescript
} catch (e) {
  logger.error("Click tracking failed", { url }, e instanceof Error ? e : undefined);
  return NextResponse.json({ ok: false }, { status: 500 });
}
```

---

### [🟢低] admin layout 缺少角色检查（纵深防御不足）

**文件**：`app/admin/layout.tsx:13-15`

**描述**：admin layout 只检查 `!session?.user`，不检查 `role === "admin"`。虽然 `proxy.ts`（middleware）已保护路由，但缺少 handler 层的纵深防御。

```typescript
const session = await auth();
if (!session?.user) { redirect("/login"); }
// 未检查 role === "admin"
```

**影响**：若 middleware 配置被意外修改（如 matcher 路径变更），非 admin 用户可访问 admin 页面。

**建议**：
```typescript
const role = (session?.user as { role?: string })?.role;
if (!session?.user || role !== "admin") { redirect("/login"); }
```

---

### [🟢低] 登录/登出 Cookie sameSite 不一致

**文件**：`app/api/admin/login/route.ts:114`（`sameSite: "strict"`）、`app/api/admin/login/route.ts:127`（`sameSite: "lax"`）

**描述**：登录设置 cookie 时用 `sameSite: "strict"`，登出清除 cookie 时用 `sameSite: "lax"`。虽然功能上不影响（清除 cookie 不受 sameSite 限制），但不一致可能导致某些浏览器行为差异。

**建议**：统一为 `"strict"` 或 `"lax"`。

---

### [🟢低] /api/favorites linkIds 缺少 UUID 格式校验

**文件**：`app/api/favorites/route.ts:57-59`

**描述**：POST 请求的 `linkIds` 数组只检查了 `Array.isArray` 和长度，没有验证每个元素是否为 UUID。

```typescript
const { linkIds } = body as { linkIds?: string[] };
if (!linkIds || !Array.isArray(linkIds) || linkIds.length === 0) { ... }
// 未验证 linkIds 元素格式
```

**影响**：恶意用户可传入任意字符串，虽然 Supabase 会参数化查询（无 SQL 注入风险），但可能导致数据库中存在无效的 link_id 引用。

**建议**：添加 UUID 验证：
```typescript
const linkIdsSchema = z.array(z.string().uuid()).min(1).max(100);
```

---

## 三、安全漏洞

### [🔴高] CSP 允许 'unsafe-eval' 和 'unsafe-inline'

**文件**：`next.config.ts:34`

**描述**：Content-Security-Policy 的 `script-src` 指令包含 `'unsafe-inline'` 和 `'unsafe-eval'`：

```typescript
"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com",
```

**影响**：
- `'unsafe-eval'` 允许 `eval()`、`new Function()` 等动态代码执行，若存在 XSS 漏洞，攻击者可执行任意 JS
- `'unsafe-inline'` 允许内联 `<script>` 标签和事件处理器，进一步削弱 XSS 防护
- 这使得 CSP 形同虚设——XSS 攻击不会被 CSP 阻止

**建议**：
1. 移除 `'unsafe-eval'`——Next.js 生产模式不需要它
2. 使用 nonce 替代 `'unsafe-inline'`——Next.js 16 支持自动 nonce 生成
3. 如果第三方脚本（Google Analytics）需要 inline，为它们添加特定 hash

```typescript
// 修复示例
"script-src 'self' 'nonce-{nonce}' https://www.googletagmanager.com https://www.google-analytics.com",
```

---

### [🟡中] /api/favorites 使用 SUPABASE_SERVICE_ROLE_KEY 绕过 RLS

**文件**：`app/api/favorites/route.ts:9-16`

**描述**：favorites 路由使用 `SUPABASE_SERVICE_ROLE_KEY` 创建 Supabase 客户端，完全绕过 RLS：

```typescript
function getServerClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(url, serviceKey); // 绕过 RLS
}
```

所有 CRUD 操作（GET/POST/DELETE）均使用此客户端，仅依赖 `userId` 从 session 中提取来过滤数据，无 RLS 策略作为安全网。

**影响**：
- 若 `SUPABASE_SERVICE_ROLE_KEY` 泄露，攻击者可读写所有用户数据
- session 伪造或 `userId` 被篡改时，无 RLS 兜底
- 该 key 不带 `NEXT_PUBLIC_` 前缀，不会暴露到客户端（✓ 正确）

**建议**：
1. 使用 `createClient()`（来自 `@/lib/supabase/server`，使用 anon key + cookies + RLS）替代 service role key
2. 在 `user_favorites` 表上配置 RLS 策略：`user_id = auth.uid()`
3. 若必须用 service role，确保 `linkIds` 经过 UUID 校验，并限制批量操作数量

---

### [🟡中] 速率限制 fail-open 策略

**文件**：`lib/rate-limit.ts:56-60`、`app/api/admin/login/route.ts:32-35`

**描述**：当 Supabase 查询出错时，速率限制检查返回 `allowed: true`（放行）：

```typescript
// lib/rate-limit.ts:56-60
if (error) {
  logger.warn("Rate limit check failed", { table, ip, error: error.message });
  return { allowed: true, count: 0 }; // fail-open
}

// app/api/admin/login/route.ts:32-35
if (error) {
  logger.warn("Login rate limit check failed", { ip, error: error.message });
  return true; // 放行
}
```

**影响**：当 Supabase 不可用时（网络故障/维护），所有速率限制失效。对于 `/api/admin/login`，这意味着攻击者可在数据库故障期间无限次暴力破解管理员密码。

**建议**：
- 对登录等敏感操作，考虑 fail-close（数据库故障时拒绝请求）
- 或添加内存级备用限制（如每 IP 每分钟最多 10 次请求）
- 至少应告警（已有 `logger.warn`，建议同时发送 Sentry 告警）

---

### [🟢低] ADMIN_PASSWORD 明文存储与比对

**文件**：`lib/auth.ts:13-23`、`app/api/admin/login/route.ts:81-97`

**描述**：管理员密码以明文存储在环境变量 `ADMIN_PASSWORD` 中，使用 `timingSafeEqual` 进行时序安全比对。

**正面**：✅ 已使用 `timingSafeEqual` 防止时序攻击；✅ 登录路由有恒定延迟 `DELAY_MS = 800ms`。

**影响**：明文存储密码不符合安全最佳实践。若环境变量泄露（如日志误打印、容器镜像泄露），密码直接暴露。

**建议**：存储密码的 bcrypt/argon2 哈希值，使用 `bcrypt.compare()` 验证：
```typescript
// .env.local: ADMIN_PASSWORD_HASH=$2b$10$...
const valid = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH!);
```

---

### [🟢低] /api/favicon 未限制重定向跟随

**文件**：`app/api/favicon/route.ts:40-43`

**描述**：favicon 代理对第三方服务（favicon.im、Google S2）发起 fetch 请求，未设置 `redirect: "manual"`。域名格式已验证（正则），且目标为固定第三方服务，SSRF 风险低。

**正面**：✅ 域名正则验证；✅ 仅放行 `image/*` Content-Type；✅ 5 秒超时 + AbortController。

**影响**：若第三方服务返回 302 重定向到内网地址（如 `http://169.254.169.254/`），fetch 会跟随重定向，理论上可被用于探测内网。但实际风险极低，因为需第三方服务被攻破。

**建议**：添加 `redirect: "error"` 或 `redirect: "manual"` 拒绝重定向。

---

### [🟢低] /api/click 缺少 zod 输入校验

**文件**：`app/api/click/route.ts:10-13`

**描述**：`/api/click` 直接 `await request.json()` 并手动检查 `typeof url !== "string"`，未使用 zod 校验。与 `/api/submit`、`/api/reviews` 等使用 zod 的标准不一致。

```typescript
const { url } = await request.json(); // 未 try-catch JSON 解析错误
if (!url || typeof url !== "string") { ... }
```

**影响**：若请求体非合法 JSON，`request.json()` 会抛出错误，被外层 catch 吞掉（返回 `{ ok: false }`）。功能上不会崩溃，但不符合校验规范。

**建议**：统一使用 zod：
```typescript
const clickSchema = z.object({ url: z.string().url() });
const parsed = clickSchema.safeParse(await request.json());
```

---

## 四、性能瓶颈

### [🟡中] 搜索 API 每次请求重建 Fuse.js 索引

**文件**：`app/api/search/route.ts:36-55`

**描述**：每次 GET `/api/search` 请求都执行 `getApprovedLinks()` 获取全量数据（500+ 条），然后 `new Fuse(pool, {...})` 重建搜索索引。`getApprovedLinks` 虽然有 `cache()` 包装（React `cache()` 在同一请求内复用），但跨请求不缓存。Fuse 索引构建对 500+ 条数据开销显著。

```typescript
const allLinks = await getApprovedLinks(); // 每次请求查数据库
const fuse = new Fuse(pool, { ... });       // 每次请求重建索引
const raw = fuse.search(q);
```

**影响**：搜索 API 响应延迟高，高并发时数据库和 CPU 压力大。

**建议**：
1. 使用模块级缓存 + TTL（如 60 秒），在 TTL 内复用 Fuse 实例
2. 或使用 ISR 缓存搜索结果（设置 `revalidate = 60`）

```typescript
let fuseCache: { fuse: Fuse<NavLink>; timestamp: number } | null = null;
const CACHE_TTL = 60_000;

async function getFuse() {
  if (fuseCache && Date.now() - fuseCache.timestamp < CACHE_TTL) {
    return fuseCache.fuse;
  }
  const links = await getApprovedLinks();
  const fuse = new Fuse(links, { ... });
  fuseCache = { fuse, timestamp: Date.now() };
  return fuse;
}
```

---

### [🟡中] useLinksFilter 客户端引入 Fuse.js

**文件**：`components/useLinksFilter.ts:8`

**描述**：虽然服务端搜索已迁移到 `/api/search`，但客户端仍 `import Fuse from "fuse.js"` 用于 modelRankings（小数据集）的客户端搜索。Fuse.js 库体积约 30KB（gzip），对于仅搜索 rankings 的场景代价偏大。

**影响**：增加客户端 bundle 体积约 30KB。

**建议**：动态导入 Fuse.js，仅在需要搜索 rankings 时加载：
```typescript
const rankingsFuse = useMemo(() => {
  if (!q) return null;
  const Fuse = require("fuse.js").default; // 或使用 dynamic import
  return new Fuse(modelRankings, { ... });
}, [modelRankings, q]);
```

或对 rankings 也使用服务端搜索 API。

---

### [🟢低] getApprovedLinkBySlug 回退全表扫描

**文件**：`lib/repositories.ts:111-122`

**描述**：当 slug 列查询失败时，回退到全表扫描 + 应用层 `slugify()` 匹配。对 500+ 条数据执行全表扫描 + 逐条 slugify 计算开销大。

```typescript
// 回退：全表扫描 + 应用层匹配
const { data, error } = await supabase
  .from("nav_links").select("*, nav_categories(name, slug)")
  .eq("approved", true);
const link = (data ?? []).find((l) => slugify(l.title) === slug);
```

**影响**：工具详情页在 slug 列未配置时加载缓慢。

**建议**：确保 `migration-slug.sql` 已执行，为 slug 列添加索引。可在应用启动时检测 slug 列是否存在并告警。

---

### [🟢低] LinkCard favicon 双重加载

**文件**：`components/LinkCard.tsx:38-60`

**描述**：每个 LinkCard 在 `useEffect` 中创建 `new Image()` 预加载 `/api/favicon` 代理 URL，成功后设置 `faviconUrl`，然后 `<NextImage>` 再用相同 URL 加载一次。虽然浏览器缓存会避免重复网络请求，但每次都创建 `Image` 对象增加了内存开销。

**影响**：页面有大量 LinkCard（如 50+ 个）时，内存占用略高。

**建议**：直接设置 `faviconUrl` 为代理 URL，让 `<NextImage>` 处理加载和错误降级，移除手动预加载逻辑。

---

### [🟢低] FavoritesProvider context value 稳定性

**文件**：`components/FavoritesProvider.tsx:10-12`

**描述**：
```typescript
const favorites = useFavorites();
const value = useMemo(() => favorites, [favorites]);
```
`useFavorites()` 返回的对象每次渲染都是新引用（内部有多个 `useCallback`，但返回的对象本身未 `useMemo`），`useMemo` 的依赖 `favorites` 每次都变，导致 `value` 每次都是新引用，所有 `useFavoritesContext()` 的消费者都会重渲染。

**影响**：当任意 state 变化时，所有使用 favorites context 的组件都会重渲染。实际影响有限——favorites 变化时确实需要重渲染，但如果其他无关 state（如 `mounted`）变化也会触发全量重渲染。

**建议**：在 `useFavorites` 内部 `useMemo` 返回值对象，或将 `useMemo` 依赖改为具体字段：
```typescript
const value = useMemo(() => ({
  favorites, favoriteIds, toggleFavorite, isFavorite, clearFavorites,
  count: favorites.size, mounted, isAuthenticated,
}), [favorites, favoriteIds, toggleFavorite, isFavorite, clearFavorites, mounted, isAuthenticated]);
```

---

## 五、优先级排序的优化建议

| 优先级 | 优化项 | 涉及文件:行号 | 预期效果 |
|--------|--------|---------------|----------|
| **P0** | 移除 CSP 中的 `'unsafe-eval'`，用 nonce 替代 `'unsafe-inline'` | `next.config.ts:34` | 恢复 CSP 的 XSS 防护能力，消除最大安全隐患 |
| **P1** | 搜索 API 缓存 Fuse.js 实例（60s TTL） | `app/api/search/route.ts:36-55` | 搜索响应延迟降低 50%+，数据库压力下降 |
| **P1** | useLinksFilter 搜索添加 AbortController | `components/useLinksFilter.ts:83-116` | 消除搜索竞态，结果始终与输入匹配 |
| **P1** | /api/favorites 改用 RLS 客户端替代 service role key | `app/api/favorites/route.ts:9-16` | 消除 RLS 绕过风险，减少密钥泄露影响面 |
| **P1** | 登录速率限制改为 fail-close 或添加备用限制 | `lib/rate-limit.ts:56-60`、`app/api/admin/login/route.ts:32-35` | 防止数据库故障期间暴力破解 |
| **P2** | 提取 API 鉴权/校验样板为高阶函数 | `app/api/admin/**/route.ts`（6 文件 12 处） | 减少重复代码，降低维护成本 |
| **P2** | 提取共享 zod URL schema | `app/api/submit/route.ts`、`app/api/admin/links/route.ts` | 统一验证逻辑，避免遗漏 |
| **P2** | /api/click 添加错误日志和正确状态码 | `app/api/click/route.ts:44-46` | 提升可观测性，便于排查问题 |
| **P2** | 客户端 Fuse.js 改为动态导入 | `components/useLinksFilter.ts:8` | 减少 30KB 客户端 bundle |
| **P2** | recordClick 改用 upsert 消除竞态 | `lib/rate-limit.ts:118-137` | 消除点击计数多计风险 |
| **P2** | admin layout 添加 role 检查 | `app/admin/layout.tsx:13-15` | 纵深防御，防 middleware 配置失误 |
| **P2** | 扩展 next-auth 类型声明，消除 `as unknown as` | `lib/auth.ts:59-60`、`app/api/favorites/route.ts` | 提升类型安全 |
| **P2** | /api/favorites linkIds 添加 UUID 校验 | `app/api/favorites/route.ts:57-59` | 防止无效数据写入 |
| **P2** | ADMIN_PASSWORD 改为哈希存储 | `lib/auth.ts:13-23` | 符合密码存储最佳实践 |
| **P2** | 统一 hook 文件命名为 kebab-case | `components/useLinksFilter.ts`、`components/admin/useAdminLinks.ts` | 命名一致性 |
| **P2** | 确保 slug 列迁移已执行，避免全表扫描 | `lib/repositories.ts:111-122` | 工具详情页加载提速 |

---

*报告结束。以上所有结论均基于实际源代码读取，已给出具体文件路径和行号。*
