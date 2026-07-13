# nav-site 全栈审查与优化报告

**项目：** `D:\nav-site`  
**线上：** https://yuanjia1314.ccwu.cc · 备用 `nav-site-kappa.vercel.app`  
**基线 HEAD：** `6a16d732`（Sprint C：scrypt / Netlify skip / 云 embed 文档）  
**审查日：** 2026-07-13  
**范围：** 前端 App Router 客户端岛、公开/管理 API、资源库检索、嵌入链路、构建部署与可观测性  
**方法：** 源码静态审查 + 既有 Sprint A–C / Phase 2 性能结论交叉验证（非渗透测试）

---

## 0. 执行摘要

| 维度 | 判断 |
|------|------|
| 安全 | Sprint A–C 已显著抬高基线。**P0 已核实 3 项：① favorites 限流与表/RLS 契约错位实质失效 ② submit 用 anon 写 `nav_links` 与 RLS 审计互斥 ③ favicon direct + 默认 redirect SSRF 面** |
| 前端性能 | 首屏已去掉 runtime motion；**全量 ~500+ 卡片同岛挂载 + 无虚拟列表** 仍是主瓶颈 |
| 后端 API | Admin 写路径较完整；**收藏限流 fail-open 恒放行**；公开高成本接口限流仅进程内；`/api/tools` 无默认 limit |
| 架构 | 生产单轨 Vercel 已落地；**向量检索依赖本机 Python + Tunnel（SPOF）**，health 对 embedding 失败不标 unhealthy |
| 配置 | 双 env 模板 / Netlify CI 残留 / Sentry sourcemap 未进构建 |

### 建议落地批次（可验证）

| Sprint | 目标 | 验收 |
|--------|------|------|
| **S0（本周 · 正确性）** | **BE-0a** favorites 限流改 service_role + 字段对齐；**BE-0b** submit/去重改 service_role + UNIQUE(url)；BE-1 SSRF；BE-2 click 原子；BE-4 生产禁明文密码；BE-7 删 public key 回落 | 31× favorites→429；submit RLS 下 200；favicon 单测；`pnpm test` 绿 |
| **S1** | FE-2 键盘索引；FE-4 卡片解嵌套；FE-6 favorites 拆订阅；BE-8 tools 默认 limit；BE-9 公开写 CSRF | E2E 键盘/收藏 + API 契约测 |
| **S2** | FE-1 虚拟列表或分页；FE-5 favicon 懒加载；BE-3 分布式限流；CFG-4 probe 要求 embedding | LH TBT / Network 并发 / smoke 失败可观测 |
| **S3** | ARCH-1 嵌入迁常开主机；ARCH-2 收口 Netlify CI；API 契约统一 | 24h embedding ok 无本机登录 |

---

## 1. 前端代码审查

### 1.1 已做得好的点

- Fuse 仅服务端动态 import（`lib/search/fuse.ts`），客户端不拉 fuse 大包。
- 首屏 runtime `motion` 已移除（历史 H10）；JSON-LD 经 `escapeJsonForHtml`。
- 外链 `isSafeUrl` + `rel="noopener noreferrer"`；登录无开放 `callbackUrl`。
- 高亮用 React 节点而非 HTML 字符串。

---

### FE-1 · P0 · 全量目录单客户端岛、无虚拟列表

| 项 | 内容 |
|----|------|
| **问题** | `app/page.tsx` 服务端拉全量 approved links，整表灌入 client `Navigation` → `ResultGrid` 一次 `map` 挂载 ~513 卡（见 `ResultGrid.tsx` 注释）。无 windowing / load-more。 |
| **影响** | HTML/JS 水合体积大、主线程长任务、DOM 节点爆炸；目录再涨则线性恶化。 |
| **操作** | ① 默认只渲染视口+缓冲（`@tanstack/react-virtual` 或自研 IO）；或 ② 首屏分类切片 +「加载更多」；③ 交互过滤优先打 `/api/search` 或 `/api/tools?limit=` 而非全量 props。 |
| **验证** | React Profiler 挂载节点数；Lighthouse TBT/LCP；`document.querySelectorAll('[data-result-index]')` 计数 ≪ 全量。 |
| **收益** | TBT/INP 明显下降；可支撑 1k+ 链接。 |

---

### FE-2 · P1 · 分类区 `sectionOffset` 共用导致键盘索引错位

| 项 | 内容 |
|----|------|
| **问题** | `AtlasWorkspace.tsx:89`：`sectionOffset = featured+latest+popular` 后，**每个** `CategorySection` 都传同一 `sectionOffset`，与 `flatResults` 累加顺序不一致 → 重复 `data-result-index` / 错链。 |
| **影响** | 方向键焦点与 Enter 打开的 `flatResults[i]` 可能不是当前 DOM 项。 |
| **操作** | 按 `flatResults` 同序在 `map` 时累加 running offset；单测：多 section 下 index 唯一且 0..n-1。 |
| **验证** | 键盘 ArrowDown 跨 section2 首项：焦点 id 与打开 URL 一致。 |
| **收益** | 键盘可达与 a11y 正确。 |

---

### FE-3 · P1 · 全局 `focusedIndex` + hover 触发全岛重渲染

| 项 | 内容 |
|----|------|
| **问题** | `ResultGrid` 每卡 `onMouseEnter → onFocusChange(idx)`，状态在 `Navigation` 顶层，数百包装器随 hover 全量 commit。 |
| **影响** | 中端 CPU 上 hover/键盘 INP 抖动。 |
| **操作** | focus 用 ref + 只改 prev/next DOM class；或虚拟列表后仅可见节点；取消 hover→全局 state（保留键盘）。 |
| **验证** | Profiler：横向扫卡 commit 次数骤降。 |
| **收益** | 交互更顺，主线程占用下降。 |

---

### FE-4 · P1 · `<button>` 嵌在 `<a>` 内（无效 HTML）

| 项 | 内容 |
|----|------|
| **问题** | `LinkCard.tsx`：外层 `<a>` 内嵌收藏/预览 `Button`。 |
| **影响** | 嵌套可交互元素；读屏与 Tab 行为不可预期；误触导航。 |
| **操作** | 卡片容器改为 `article`/`div`；主链单独 `<a>`；收藏/预览为兄弟节点（绝对定位可保留视觉）。 |
| **验证** | axe / HTML 校验；键盘 Tab/Enter/Space 分控主链与心形。 |
| **收益** | 合规 a11y 树、更少误点。 |

---

### FE-5 · P1 · 首屏 favicon 扇出

| 项 | 内容 |
|----|------|
| **问题** | 每卡 `useFavicon(domain)` → 并发请求 `/api/favicon`（模块 Map 去重域，不限并发）。 |
| **影响** | 数百并行请求争抢带宽与服务端限流；拖慢搜索/分析请求。 |
| **操作** | IntersectionObserver 仅视口加载；并发池 N=6；热门域可预置。 |
| **验证** | Network：首屏 3s 内 `/api/favicon` 并发峰值下降。 |
| **收益** | 首交互更稳；后端 429 减少。 |

---

### FE-6 · P1 · Favorites 拆分未用尽，一键触发全卡重渲染

| 项 | 内容 |
|----|------|
| **问题** | Provider 已文档化 State/Actions 拆分，但 `LinkCard` 仍 `useFavoritesContext()` 读全量 state。 |
| **影响** | 点一次心形 → ~500 卡 re-render；`memo` 失效。 |
| **操作** | 卡内用 `useFavoritesActions` + 独立 `FavoriteButton` 只订 `has(id)`；Header/QuickView 同改。 |
| **验证** | Profiler：toggle 一心形仅 1–2 卡 commit。 |
| **收益** | 收藏交互接近 O(1)。 |

---

### FE-7 · P1 · 布局层 Session/Favorites 全局 client 化

| 项 | 内容 |
|----|------|
| **问题** | `layout` → Theme → Session → Favorites → Shell 全 client；首页 atlas 整块 client。 |
| **影响** | 匿名访客也付 Session 客户端成本；难做 RSC 流式静态壳。 |
| **操作** | 静态 chrome RSC；`SessionProvider` 收窄到 admin/favorites 路由；atlas 单独小岛。 |
| **验证** | Bundle analyzer 首页 client entry 体积下降。 |
| **收益** | 默认 JS 更小、边界更清晰。 |

---

### FE-8–12 · P2（摘要）

| ID | 问题 | 操作 | 验证 |
|----|------|------|------|
| **FE-8** | `motion` 依赖残留、仅类型引用 | 删 dep + `lib/animations.ts` 或 eslint ban | `pnpm why motion` 为空 |
| **FE-9** | 空查询时客户端 `buildSearchFacets` 全表扫 | memo / 服务端 facets | Performance mark |
| **FE-10** | `/resources` 搜索无 label、chip 无 `aria-pressed`、`catCounts` 每 render、fetch 无 abort | a11y 属性 + useMemo + AbortController | axe + Network abort |
| **FE-11** | CSP `script-src 'unsafe-inline'`（GA/Next） | 长期 nonce/hash；禁止用户 HTML sink | CSP report-only |
| **FE-12** | Shell context 值未 memo；过滤状态扇出大 | memo context；拆 search 与 facet state | Profiler sidebar/search |

---

## 2. 后端代码审查

### 2.1 已做得好的点

- Admin：`proxy.ts` matcher + `withAdmin*`；写路径 Zod + 部分 CSRF；登录限流 fail-close + 恒时延迟。
- GitHub OAuth 默认 `role: "user"`，不自动 admin。
- `attachTagsToLinks` 批量 `in (...)`，非 N+1。
- Hybrid RRF 客户端合并可降级；semantic 失败熔断回 Fuse。
- Reviews 响应 omit IP；favorites session 隔离有注释。

---

### BE-0a · P0 · 收藏限流实质失效（表无 SELECT + 写不存在的 `success` 列）

| 项 | 内容 |
|----|------|
| **问题** | `enforceFavoritesRateLimit` → `checkRateLimit("favorites_rate_limits")` 默认 `createClient()`（anon）。`scripts/migration-favorites-rate-limits.sql` 仅 GRANT/policy **INSERT**，**无 SELECT** → count 报错 → **fail-open 恒 `allowed: true`**。随后 `recordAttempt(..., success)` insert `{ ip, success }`，表结构仅 `id, ip, created_at` → 写入失败（仅 warn）。 |
| **位置** | `app/api/favorites/route.ts:30-37,93` · `lib/rate-limit.ts:109-167` · `scripts/migration-favorites-rate-limits.sql:7-35` |
| **影响** | 登录用户可无限刷 POST/DELETE favorites（绕过「15 分钟 30 次」），放大 service_role 写路径与 DB 负载。**限流代码存在但运行时无效。** |
| **操作** | ① 限流读写传入 `createServiceRoleClient()`（与 reviews 一致），或补 SELECT policy + DELETE 给清理路径；② `recordAttempt` 按表裁剪字段（仅 `{ ip }`）或迁移加 `success boolean`；③ 写操作可对限流 DB 故障 fail-close。 |
| **验证** | 连续 31 次已登录 POST `/api/favorites`：第 31 次 **429**；`favorites_rate_limits` 有对应 IP 行；单测 mock RLS 无 SELECT 时不得 fail-open（若改 fail-close）。 |
| **收益** | 收藏写限流从「纸面」变为「可执行」。 |

---

### BE-0b · P0 · 公开提交用 anon 写 `nav_links`，与 RLS 审计互斥

| 项 | 内容 |
|----|------|
| **问题** | `submitLink` / `findExistingLinkByUrl` 使用 `createClient()`（anon + cookies）。`scripts/rls-audit.sql` 预期 **anon 不能 INSERT `nav_links`**，且 anon SELECT 通常仅 `approved=true`。 |
| **位置** | `lib/repositories/submissions.ts:7-36` · `app/api/submit/route.ts` · `scripts/rls-audit.sql` |
| **影响** | ① 若按审计加固 RLS：`/api/submit` 永久 500；② 若误开 anon INSERT：任意人可写业务表；③ pending URL 对 anon 不可见 → 去重失效 → 重复提交脏数据。 |
| **操作** | ① 提交与去重改 `createServiceRoleClient()`；② 仅插入 `approved: false`；③ DB `UNIQUE(url)` 或 partial unique；④ 保持 anon 直连 PostgREST INSERT 失败。 |
| **验证** | RLS 开启下 POST `/api/submit` → 200 且行 `approved=false`；anon key 直连 INSERT 失败；同 URL 再提交 → 409「等待审核」。 |
| **收益** | 提交功能与最小权限模型同时成立。 |

---

### BE-1 · P0 · Favicon direct 源 + 默认 redirect → SSRF 面

| 项 | 内容 |
|----|------|
| **问题** | `app/api/favicon/route.ts` 第 4 级：`fetch(https://${domain}/favicon.ico)`。`isBlockedOutboundHost`（`lib/utils.ts:92-126`）仅拦**字面 hostname**，**不解析 DNS**；`fetch` 默认跟随 302 → 可跳到链路本地/元数据（若攻击域配合）。响应体无严格上限（仅跳过 <100B）。 |
| **影响** | 云元数据/内网探测跳板；与进程内 120/min 限流叠加可被放大。 |
| **操作** | ① **推荐**：删除 direct 源，仅 CDN 图标服务；② 若保留：`redirect: "manual"` 或逐跳校验；DNS 解析后对 A/AAAA 再跑私网检查；body 上限（如 256–512KB）；禁止非 80/443。 |
| **验证** | 单测：302→`169.254.169.254` 不得发出成功体；`127.0.0.1` 已拦；`pnpm test tests/api-favicon.test.ts`。 |
| **收益** | 消除当前最明确的服务端 SSRF 面。 |

---

### BE-2 · P1 · `/api/click` 限流 TOCTOU

| 项 | 内容 |
|----|------|
| **问题** | `checkClickRateLimit` → `incrementClickCount` → `recordClick`（`app/api/click/route.ts:37-48`）。并发双请求可都通过 count===0 后双次 +1。 |
| **影响** | 热门榜可被短时并发刷高。 |
| **操作** | 先 insert 去重表，非 23505 再 increment；或单 RPC 事务 `try_record_and_increment`。 |
| **验证** | 并行 20× 同 IP+URL：`click_count` 仅 +1。 |
| **收益** | 统计可信。 |

---

### BE-3 · P1 · 高成本公开 API 仅内存限流

| 项 | 内容 |
|----|------|
| **问题** | `/api/search`、`/favicon`、`/resource-search` 使用 `checkInMemoryRateLimit`（`lib/rate-limit.ts` 已注明多实例不共享）。resource-search 还打 embed + 上游 Edge。 |
| **影响** | Vercel 多实例下有效配额 × 实例数；易打爆 embed/RL/DB。 |
| **操作** | Upstash/Redis 或 DB 滑动窗口；边缘 WAF 配额；hybrid 保留快速短路。 |
| **验证** | 两实例各打满后第三请求仍 429。 |
| **收益** | 成本与 DoS 面可控。 |

---

### BE-4 · P1 · 生产仍兼容明文 `ADMIN_PASSWORD`

| 项 | 内容 |
|----|------|
| **问题** | `lib/admin-password.ts:100-116`：无 hash 时回退明文 `timingSafeEqual`。记忆称生产已只用 HASH，但**代码路径仍在**。 |
| **影响** | 配置回退/新环境误配 → 明文口令；审计上无法 fail-closed。 |
| **操作** | `NODE_ENV=production` 或 `VERCEL=1` 时禁止 plaintext；缺 hash 登录恒 false；文档只保留 `pnpm hash:admin-password`。 |
| **验证** | 单测：仅 `ADMIN_PASSWORD` 在 production 返回 false。 |
| **收益** | 凭证基线不可回退。 |

---

### BE-5 · P1 · 评价默认 `approved: true` + 查重 fail-open

| 项 | 内容 |
|----|------|
| **问题** | `lib/repositories/reviews.ts` 自动通过；查重错误当「未评」；`/api/reviews` 无 Origin 校验。 |
| **影响** | 垃圾评价即时上架；错误路径仍可能撞唯一约束 500。 |
| **操作** | 默认未审核或管理员队列；查重错误 503；23505→409；写接口 `checkOrigin`。 |
| **验证** | mock select 失败无新行；重复 IP+link → 409。 |
| **收益** | 内容质量 + 滥用收敛。 |

---

### BE-6 · P1 · `/api/resource-ratings` 限流失败仍写入

| 项 | 内容 |
|----|------|
| **问题** | rate-limit 查询失败仅 warn，仍 service_role insert。 |
| **影响** | RL 侧限流表故障时开放刷分。 |
| **操作** | fail-close 503；UNIQUE(ip, page_id)；`failClose: true`。 |
| **验证** | mock count error → 503 且无 insert。 |
| **收益** | 评分可信。 |

---

### BE-7 · P1 · 资源搜索 API Key 回退 `NEXT_PUBLIC_*`

| 项 | 内容 |
|----|------|
| **问题** | `app/api/resource-search/route.ts`：`RESOURCE_LIBRARY_API_KEY \|\| NEXT_PUBLIC_RESOURCE_LIBRARY_API_KEY`。 |
| **影响** | 特权 key 若误配 public 会进浏览器包。 |
| **操作** | 删除 public 回退；缺 key → 503；CI 扫 `NEXT_PUBLIC_.*KEY\|SERVICE_ROLE`。 |
| **验证** | 仅 public 变量时 503。 |
| **收益** | 防密钥上客户端。 |

---

### BE-8 · P1 · `/api/tools` 无默认 limit、无限流、全表+内存 filter

| 项 | 内容 |
|----|------|
| **问题** | `limit` optional，省略则返回全部（`route.ts:68-71`）；先全量 `getApprovedLinksForApi` 再内存 search/ids。 |
| **影响** | Agent/爬虫反复全量拉；DB/带宽成本。 |
| **操作** | 默认 `limit=50`，强制 max 100；offset/cursor；DB range；IP 限流。 |
| **验证** | 无 query 时 `tools.length ≤ 50`；`limit=1000` → 400。 |
| **收益** | 公开 API 可扩展。 |

---

### BE-9–12 · P2（摘要）

| ID | 问题 | 操作 | 验证 |
|----|------|------|------|
| **BE-9** | CSRF 仅 admin 写 + favorites；submit/reviews/ratings/click 无 Origin | 公开写统一 `checkOrigin` | evil Origin → 403 |
| **BE-10** | `/api/health` 泄露 DB error、env 名、memory、commit | 对外粗粒度；明细 token/admin | 未授权无 error.message |
| **BE-11** | 错误体/分页/语言不统一；checkout/webhook 501 桩 | 统一 envelope + code | 契约测试 / api-docs |
| **BE-12** | 生产无 `EMBED_SERVER_URL` 时 semantic 仍可能探 loopback（dev 默认） | prod 无 URL → null 不 fetch | unit embedding-runtime |

---

## 3. 整体架构建议

### ARCH-1 · High · 向量检索多跳本机 SPOF

| 项 | 内容 |
|----|------|
| **问题** | `Vercel → Worker → Named Tunnel → 本机 :18003 BGE`。本机休眠/未登录/隧道断 → vector/hybrid 静默降级 FTS。登录自启任务已于 2026-07-13 **卸载**，更依赖手动 `ensure-embed-stack`。 |
| **影响** | 「语义检索」产品能力无 SLA。 |
| **操作** | ① 嵌入迁常开 VPS/小规格云主机；② health/smoke **要求** embedding ok（见 CFG-4）；③ 文档改称「公网入口 + 私有 origin」，勿称已上云。 |
| **验证** | 本机关机 24h 后 `/api/health` embedding 仍 ok（迁机后）；或 smoke 失败告警（迁机前）。 |
| **收益** | 语义能力与工作站解耦。 |

---

### ARCH-2 · High · 双部署心智（Vercel 真生产 + Netlify/CI 残留）

| 项 | 内容 |
|----|------|
| **问题** | 生产已 Vercel；Netlify site disabled + ignore。但 GHA 仍有 Netlify 等待/镜像逻辑；headers 双份（`next.config` + `netlify.toml`）；无仓库内 `vercel.json` 描述部署。 |
| **影响** | 误启 Netlify 烧 credit / 环境分裂。 |
| **操作** | Netlify job 标 emergency-only 或归档；push→Vercel + smoke 对自定义域；headers 单源。 |
| **验证** | push master 仅 Vercel 变更；Netlify 无新 deploy。 |
| **收益** | 单轨发布。 |

---

### ARCH-3 · Medium · 资源库 Supabase URL 硬编码

| 项 | 内容 |
|----|------|
| **问题** | `lib/resource-library/client.ts:3` 写死 `https://ihnmfsfbfnctgkhxmghk.supabase.co`；读路径可回退 service_role。 |
| **影响** | 第二生产依赖不可 env 切换；最小权限模糊。 |
| **操作** | `RESOURCE_LIBRARY_SUPABASE_URL`；公开读仅 anon+RLS；禁 service_role 读路径。 |
| **验证** | 暂存用替换 URL 健康检查指向新项目。 |
| **收益** | 边界清晰、凭证更安全。 |

---

### ARCH-4 · Low–Med · ADR-005 撞号 + `SOURCE_*` 残留

| 项 | 内容 |
|----|------|
| **问题** | 两个 ADR-005；CI 仍注入 `SOURCE_SUPABASE_*`。 |
| **影响** | 新人接错库。 |
| **操作** | 重编号 ADR；CI 统一 `NEXT_PUBLIC_SUPABASE_*`。 |
| **验证** | 仅新密钥名 CI 绿。 |
| **收益** | 文档=现实。 |

---

### 架构目标态（建议）

```
[Browser]
   │
   ▼
[Vercel Next.js] ── nav DB (Supabase env)
   │
   ├─ /api/search (Fuse/pgvector) ──► nav DB
   ├─ /api/resource-* ──► RL Supabase (env URL + anon)
   └─ embed (optional) ──► HTTPS origin (always-on) + Bearer
                              ▲
                              └── 非本机登录会话
```

---

## 4. 配置 / 构建 / 部署优化

### CFG-1 · Medium · 双 env 模板不一致

| 项 | 内容 |
|----|------|
| **问题** | `.env.example` 过简；`.env.local.example` 较全。易漏 `AUTH_SECRET` / `EMBED_*` / RL。 |
| **操作** | 单一 canonical 模板：required vs optional 分段；`pnpm setup` 只认一份。 |
| **验证** | 新 clone 按模板可跑 admin + search。 |
| **收益** | 少「本地好、线上挂」。 |

---

### CFG-2 · Low–Med · 强制 webpack

| 项 | 内容 |
|----|------|
| **问题** | 因 Windows NTFS reparse 锁 webpack；Vercel Linux 可能无此必要。 |
| **操作** | CI/Linux 试默认 bundler；文档说明 Windows 例外。 |
| **验证** | Ubuntu `pnpm build` 成功且更快。 |
| **收益** | 构建时间与可移植性。 |

---

### CFG-3 · Medium · Sentry release/sourcemap 未进构建

| 项 | 内容 |
|----|------|
| **问题** | `SENTRY_AUTH_TOKEN` 缺则无 sourcemap；health 只查 DSN 存在。 |
| **操作** | Vercel 构建注入 token；发测试事件核对符号化。 |
| **验证** | Sentry 中 release=commit 且栈可读。 |
| **收益** | 真可观测，非「配置存在」。 |

---

### CFG-4 · Medium · Health/Probe 视 embedding 为可选

| 项 | 内容 |
|----|------|
| **问题** | 仅 database+env 影响 `healthy`；smoke 默认不要求 embedding；无 vector POST 探针。 |
| **操作** | 生产 smoke `--require-embedding`；可选 POST hybrid；失败开 Issue。 |
| **验证** | 停 embed → smoke 红；恢复 → 绿。 |
| **收益** | 暴露真实 SPOF。 |

---

### CFG-5 · Medium · CI 未门禁真实 Vercel 路径

| 项 | 内容 |
|----|------|
| **问题** | quality 强；e2e 缺 AUTH/embed；Lighthouse `continue-on-error`；deploy 仍偏 Netlify dispatch。 |
| **操作** | push 后对 `yuanjia1314.ccwu.cc` smoke；密钥名对齐；e2e 复用 build 产物。 |
| **验证** | 坏 commit 无法在无告警下静默上线。 |
| **收益** | CI 保护真生产。 |

---

### CFG-6 · Medium · 「云 embed」话术 vs 本机 origin

| 项 | 内容 |
|----|------|
| **问题** | 文档/ADR 易读成已云化；origin 仍是本机；autostart 已卸。 |
| **操作** | runbook 写清 RTO；常开服务或接受 FTS 降级并告警。 |
| **验证** | 冷启动无交互登录的行为与文档一致。 |
| **收益** | 运维预期诚实。 |

---

## 5. 优先级总表

| 优先级 | ID | 主题 |
|--------|-----|------|
| **P0** | **BE-0a, BE-0b, BE-1** | **收藏限流失效、submit/RLS、Favicon SSRF** |
| P0/P1 | FE-1 | 全量卡片虚拟化/分页（体验硬伤） |
| P1 | FE-2, FE-4, FE-6, FE-3, FE-5 | 键盘/a11y/收藏/focus/favicon |
| P1 | BE-2, BE-3, BE-4, BE-5, BE-6, BE-7, BE-8, BE-9 | 点击、分布式限流、密码、评价、评分、key、tools、CSRF |
| High | ARCH-1, ARCH-2 | Embed HA、单轨部署 |
| Med | CFG-1–6, ARCH-3/4, FE-7–12, BE-10–12 | 配置、契约、a11y 余量 |

---

## 6. 建议不在本轮做的事

- 全站 BEM→utility 重写（与 blog 结论一致，nav 也非痛点）。
- 为 ~500 链接上 Meili/ES（Fuse + 服务端 search 足够；先虚拟列表）。
- 无 RUM 样本时伪造 Web Vitals p75。
- 删除 Netlify 站点实体（已 disable 即可，除非确认永不回滚）。

---

## 7. 验证命令速查

```powershell
cd D:\nav-site
pnpm test
pnpm typecheck
pnpm lint
pnpm test tests/api-favicon.test.ts tests/security.test.ts tests/admin-password.test.ts
pnpm verify:production
# 可选：
# pnpm e2e
# pnpm analyze
```

---

## 8. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-13 | 初版：FE/BE/ARCH/CFG 合并；基线 `6a16d732`；embed 自启已卸事实已写入 ARCH-1 |
| 2026-07-13 | **补强：** 交叉验证新增 **BE-0a**（favorites 限流表/字段契约）与 **BE-0b**（submit anon vs RLS）；S0 与优先级总表同步 |

**下一步：** 若授权，优先落地 **S0（BE-0a + BE-0b + BE-1 + BE-2 + BE-4 + BE-7）** 小 PR，再 FE-2/FE-4/FE-6。

## 9. 落地清单（2026-07-13 工程实现）

验证：`pnpm test` **415 passed** · `pnpm typecheck` 通过

| ID | 状态 | 实现要点 |
|----|------|----------|
| BE-0a | ✅ | favorites 限流 service_role + 无 success 列裁剪 + fail-close |
| BE-0b | ✅ | submit/去重 service_role；duplicate→409；CSRF Origin |
| BE-1 | ✅ | 去掉 favicon direct；`redirect:manual`；body 上限 512KB |
| BE-2 | ✅ | `tryRecordClick` 先插后 increment |
| BE-4 | ✅ | 生产/Vercel 禁明文 `ADMIN_PASSWORD` |
| BE-5 | ✅ | 评价默认 `approved:false`；查重 fail-close；CSRF |
| BE-6 | ✅ | ratings 限流失败 503；CSRF |
| BE-7 | ✅ | 删除 `NEXT_PUBLIC_RESOURCE_LIBRARY_API_KEY` 回落 |
| BE-8 | ✅ | tools 默认 limit=50 |
| BE-9 | ✅ | submit/click/reviews/ratings Origin |
| FE-1 | ✅ | ResultGrid 渐进挂载 +「加载更多」 |
| FE-2 | ✅ | CategorySection 累加 sectionOffset |
| FE-3 | ✅ | 去掉 hover→全局 focus |
| FE-4 | ✅ | 卡片 article 解嵌套 a/button |
| FE-5 | ✅ | favicon 并发池 6 + 窗口化降扇出 |
| FE-6 | ✅ | `FavoriteButton` 独立订阅 |
| FE-8 | ✅ | 移除 `motion` 与 `lib/animations.ts` |
| FE-10 | 部分 | resources 搜索 aria-label + chip aria-pressed |
| CFG-4 | ✅ | probe `--require-embedding`；health 可选 `HEALTH_REQUIRE_EMBEDDING=1` |
| CFG-6 | ✅ | runbook 澄清本机 origin + 自启已卸 |
| ARCH-2 | 部分 | CI Netlify job 标 Emergency + `ALLOW_NETLIFY_MIRROR` |
| ARCH-3 | 部分 | RL URL 可 env 覆盖 |
| ARCH-1 | ⏳ | 嵌入迁常开 VPS（运维，非代码） |
| BE-3 | ⏳ | 真·分布式限流（Upstash）未装；仍进程内+DB 表 |

报告：`docs/full-stack-audit-2026-07-13.md`
