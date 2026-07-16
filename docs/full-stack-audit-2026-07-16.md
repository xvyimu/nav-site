# nav-site 全栈审查与优化报告

| 项 | 值 |
|----|-----|
| 项目 | `D:\nav-site` |
| 线上 | https://yuanjia1314.ccwu.cc · 备用 `nav-site-kappa.vercel.app` |
| 基线 HEAD | `96e58a20`（探针 CDN no-store 适配） |
| 线上 build-info | `56941d27`（Cache/CDN no-store 头） |
| 审查日 | 2026-07-16 |
| 范围 | App Router 前端岛、公开/管理 API、双库检索、嵌入链路、构建部署与可观测性 |
| 方法 | 源码静态审查 + 生产 Supabase 授权抽查 + 既有 S0–S3 落地交叉验证（非渗透） |
| 本地门禁（本基线） | vitest 456 passed · pytest 29 · typecheck clean · 生产探针全 PASS |

---

## 0. 执行摘要

| 维度 | 判断 |
|------|------|
| 安全 | S0–S3 已抬高基线（favicon SSRF 收敛、submit/favorites service_role、click 原子去重、admin scrypt、S0 URL unique）。**仍有 P0：生产 `update_link_embedding` 为 SECURITY DEFINER 且 EXECUTE 对 PUBLIC；`search_links_semantic` EXECUTE 对 PUBLIC。** |
| 前端 | LinkCard 已解嵌套；ResultGrid 有渐进挂载。**主瓶颈仍是整表灌入单客户端岛；Favorites 契约错位；浏览态筛选未生效；flatResults 可能重复。** |
| 后端 API | 限流/RPC 分层清晰。**IP 可 spoof；submit 限流 fail-open；RL 读路径可回落 service_role；搜索冷路径全表 Fuse 池。** |
| 架构 | Vercel 单轨生产清晰；**默认 embed 仍依赖本机 Tunnel（SPOF）**；nav 单库 + RL 第二项目。 |
| 配置 | CSP/HSTS/探针/CI 较完整。**文档仍有 Netlify 心智残留；Upstash 可选；CSP `unsafe-inline`；coverage 门槛偏低。** |

### 与 2026-07-13 报告对照

| 13 日项 | 16 日状态 |
|---------|-----------|
| BE-0 favorites/submit 限流与 RLS | 代码侧已改 service_role + S0 表/RPC（生产 migration 已应用） |
| BE-1 favicon SSRF | 已收敛固定 CDN + redirect manual |
| BE-2 click 原子 | 已落地 `click_rate_limits` unique |
| FE-4 `<a>` 嵌 button | **已修**（`LinkCard` article 兄弟结构） |
| BE-3 分布式限流 | 代码有 Upstash 路径；**生产是否配置仍属运维** |
| ARCH-1 嵌入迁常开 | **未完成**（Cloudflare 1024-d 路径代码+SQL 就绪，未默认切） |
| 新增 P0 | 生产 512-d RPC 授权过宽（实测） |

### 建议落地批次

| Sprint | 目标 | 验收 |
|--------|------|------|
| **T0（本周 · 安全）** | 锁定 `update_link_embedding` / `search_links_semantic` EXECUTE；submit `failClose`；生产 RL 禁 service_role 读回落 | SQL 抽查 grantee 仅 service_role；提交风暴测；anon-only RL health |
| **T1** | 修 Favorites 契约；browse 筛选；flatResults 去重；键盘/挂载预算对齐 | `/favorites` 卡片有 title；筛选空 q 生效；键盘跨 section 正确 |
| **T2** | 可信 IP；Upstash 强制；搜索池/分页或 FTS | 伪造 XFF 不破限流；多实例配额≈设定；search p95 不随 N 线性爆 |
| **T3** | ARCH-1 Cloudflare/VPS；CSP nonce；文档 Vercel 归一；coverage 抬升 | 24h embedding=ok 无本机；LH + 文档一致 |

---

## 1. 前端代码审查

### 1.1 已做得好的点

- Fuse 仅服务端动态 import（`lib/search/fuse.ts`），客户端不背 fuse。
- 首屏无 runtime motion；JSON-LD `escapeJsonForHtml`；高亮用 React 节点。
- 外链 `isSafeUrl` + `rel="noopener noreferrer"`；`LinkCard` 主链与收藏/预览为兄弟节点（`components/LinkCard.tsx:56-69`）。
- `FavoriteButton` 已拆 `useFavoritesActions` / `useFavoriteMembership`，避免整树订阅。
- MobileNav / ToolQuickView / Toaster 动态 import。

---

### FE-1 · P0 · 收藏页把 `/api/tools` 误当成 `NavLink[]`

| 项 | 内容 |
|----|------|
| **问题描述** | `app/favorites/FavoritesView.tsx:19-23`：`fetch('/api/tools?ids=…')` 后 `setLinks(data.tools as NavLink[])`。但 `app/api/tools/route.ts` 返回 Agent 形：`name`、嵌套 `category`、字符串 `tags`，不是 `NavLink`（`title` / `category_slug` / `Tag[]`）。 |
| **影响评估** | 收藏列表 title/分类/时间/排序静默错误或空白；TypeScript 被 `as` 掩盖，线上难发现。 |
| **推荐操作** | ① 新增 `GET /api/favorites/links`（session 内、按 `user_favorites` 投 `PUBLIC_LINK_SELECT`）；或 ② 明确 mapper `tools→NavLink` 并 Zod 校验；③ 去掉 `as NavLink[]`；④ `ids` 上限 + `favoriteIds` 稳定依赖。 |
| **验证** | 登录收藏 ≥1 条 → `/favorites` 卡片 title/domain 正确；单测 mock tools 形不得通过。 |
| **预期收益** | 收藏页功能恢复；消除契约漂移。 |

---

### FE-2 · P1 · 浏览态评分/热度筛选仅 UI，未进 `filtered`

| 项 | 内容 |
|----|------|
| **问题描述** | `SearchExperiencePanel` / filter state 有 `minRating`、`popularity` 等；`useServerSearch` 仅在有 `q` 时带到 API；`useDerivedLinks.ts:103-135` 空 `q` 只做分类+标签，**忽略评分/热度**。 |
| **影响评估** | 用户以为筛选生效，列表仍是全量；信任与数据一致性受损。 |
| **推荐操作** | ① 从 `lib/search-experience.ts` 抽出 `applyBrowseFilters`；② 在 `useDerivedLinks` 的 `filtered` 中对空 q 路径调用；③ 单测：`minRating=4` 且 `q=""` 结果变少。 |
| **验证** | URL/面板设筛选后 DOM 卡片数下降；与服务端同规则用例一致。 |
| **预期收益** | 筛选可信；减少「坏数据」误报。 |

---

### FE-3 · P1 · `latest` 与 `featured` 重叠 → `flatResults` 重复索引

| 项 | 内容 |
|----|------|
| **问题描述** | `useDerivedLinks.ts:137-157`：`featured = featured\|\|paid`；默认 `latest` 按时间 top6 **不排除** featured/paid；`flatResults:217-229` 顺序拼接 featured→latest→popular→sections。同一 link 可出现两次。 |
| **影响评估** | 键盘 `focusedIndex` / Enter 打开错链；`totalResults` 虚高。 |
| **推荐操作** | ① `latest` 与 `popular` 一样排除 `featured\|\|paid`；② `flatResults` 按 `link.id` Set 去重；③ 单测：featured id 在 flat 中唯一。 |
| **验证** | ArrowDown 跨区焦点 id 与打开 URL 一致；计数 = 唯一 id 数。 |
| **预期收益** | 键盘可达正确；统计可信。 |

---

### FE-4 · P1 · 渐进挂载预算与 DualTrack / 键盘不同步

| 项 | 内容 |
|----|------|
| **问题描述** | `AtlasWorkspace` 对 `linkSections` 做 mount budget；`DualTrackSection` 默认每轨 `initialVisible=24`；`useKeyboardNav` 索引完整 `flatResults`，而 `ResultGrid` 只挂 `slice(0, visibleCount)`。 |
| **影响评估** | 键盘可聚焦「未挂载」行 → 无焦点/死键；预算名存实亡。 |
| **推荐操作** | ① 统一预算源；② 焦点落入未挂载 index 时先 `loadMore` 再 focus；③ querySelector 未命中则扩窗重试。 |
| **验证** | 长列表 ArrowDown 到第 30 项：DOM 出现且 focus 正确。 |
| **预期收益** | 首屏可控 + a11y 完整。 |

---

### FE-5 · P1 · 全量目录灌入单一 client island

| 项 | 内容 |
|----|------|
| **问题描述** | `app/page.tsx` SSR 拉全量 approved → `Navigation`（client）持有完整 `links`；过滤/排序/分区全在客户端 memos。 |
| **影响评估** | 水合 JSON 与主线程成本随 N 线性涨（~500+ 已吃紧，1k+ 恶化）。 |
| **推荐操作** | ① 首屏服务端切片 + `/api/tools` 或 cursor 加载；或 ② 虚拟列表（`@tanstack/react-virtual`）；③ `pnpm analyze` 对比前后。 |
| **验证** | Profiler 挂载节点；Lighthouse TBT/LCP；`[data-result-index]` 计数 ≪ 全量。 |
| **预期收益** | TTI/INP 下降；目录可扩展。 |

---

### FE-6 · P1 · `useServerSearch` 依赖 `links` + 弱类型映射

| 项 | 内容 |
|----|------|
| **问题描述** | `components/navigation/useServerSearch.ts` effect 依赖 `links` 引用 → 父重渲染可中止/重发搜索；响应 `as` 映射，`created_at` 可被置空。 |
| **影响评估** | 多余请求与竞态；搜索卡「相对时间」错误。 |
| **推荐操作** | ① fetch effect 去掉 `links`；② 与 API 共享 Zod schema；③ 透传真实 `created_at`。 |
| **验证** | 搜索中父更新不触发 abort 风暴；卡片时间非空。 |
| **预期收益** | 搜索稳定；类型安全。 |

---

### FE-7 · P2 · Favorites 热路径仍有全 context 订阅

| 项 | 内容 |
|----|------|
| **问题描述** | `Header` / `ToolQuickView` / `FavoritesView` 仍用全量 `useFavoritesContext()`，toggle 可牵动 chrome 重渲染。 |
| **影响评估** | 中端设备上收藏操作 INP 抖动。 |
| **推荐操作** | Header 只订 `count`；QuickView 用 membership+actions；FavoritesView 只订 state。 |
| **验证** | Profiler：toggle 时 Header commit 不再必现。 |
| **预期收益** | 交互更顺。 |

---

### FE-8 · P2 · localStorage 收藏解析无校验

| 项 | 内容 |
|----|------|
| **问题描述** | `lib/use-favorites.ts` `JSON.parse` 后直接 `as string[]` 进 Set。 |
| **影响评估** | 污染存储导致幽灵 membership / 脏 POST。 |
| **推荐操作** | `Array.isArray` + 字符串/UUID 过滤，失败则清 key。 |
| **验证** | 写入 `"{}"` 后刷新恢复空收藏且不崩。 |
| **预期收益** | 客户端状态自愈。 |

---

## 2. 后端代码审查

### 2.1 已做得好的点

- favicon：固定第三方 CDN、body 上限、`redirect: "manual"`、出站 host 黑名单。
- admin：scrypt + 生产禁明文（`lib/admin-password.ts`）；写路径 session role + CSRF。
- click：原子 unique 插入（S0 `click_rate_limits`）。
- 公开链接投影：`PUBLIC_LINK_SELECT` 显式列，embedding 不进 PostgREST 宽表。
- submit：`approved: false` + service_role；S0 `UNIQUE(url)` 已上生产。
- S0 生产 migration 已应用：`list_public_tools`、`consume_rate_limit`、`embedding_1024`、v2 RPC（service_role only）。

---

### BE-1 · P0 · 生产 `update_link_embedding` SECURITY DEFINER + PUBLIC EXECUTE

| 项 | 内容 |
|----|------|
| **问题描述** | 生产实测：`update_link_embedding` **`security_definer=true`**，`execute_grantees` 含 **`PUBLIC`**。v2 已正确收口到 `service_role`。 |
| **影响评估** | 持有 anon key 的客户端可经 PostgREST 改写任意链接 512-d 向量 → 语义排序投毒 / 完整性破坏。 |
| **推荐操作** | ```sql<br>REVOKE EXECUTE ON FUNCTION update_link_embedding(uuid, vector) FROM PUBLIC, anon, authenticated;<br>GRANT EXECUTE ON FUNCTION update_link_embedding(uuid, vector) TO service_role;<br>ALTER FUNCTION update_link_embedding(uuid, vector) SET search_path = public, extensions;<br>-- 中期：改为 SECURITY INVOKER 或仅保留 batch 路径<br>``` 写入 `scripts/migration-pgvector-harden.sql` 并 apply。 |
| **验证** | `information_schema.routine_privileges` 仅 postgres/service_role；anon JWT 调 RPC → 权限错误。 |
| **预期收益** | 关闭 definer 写面；与 S0 v2 一致。 |

---

### BE-2 · P0 · 生产 `search_links_semantic` 对 PUBLIC 可 EXECUTE

| 项 | 内容 |
|----|------|
| **问题描述** | 生产实测：`search_links_semantic` grantee 含 **PUBLIC**；应用默认仍走该 RPC（非 Cloudflare 时，`lib/search/semantic.ts`）。v2 仅 service_role。 |
| **影响评估** | 绕过应用层 search 限流，直接打 HNSW/CPU；成本与爬取面。 |
| **推荐操作** | 与 v2 相同 REVOKE/GRANT；强制语义只经 app service_role。 |
| **验证** | anon RPC 拒绝；app `/api/search?semantic=true` 仍 200（service_role）。 |
| **预期收益** | 语义入口单一、可计量。 |

---

### BE-3 · P1 · `getClientIp` 信任客户端可伪造头

| 项 | 内容 |
|----|------|
| **问题描述** | `lib/utils.ts:73-86` 顺序信任 `x-nf-client-connection-ip` → `x-real-ip` → `x-forwarded-for` 第一段，无平台白名单。login/submit/favorites/search/favicon 等均依赖。 |
| **影响评估** | 在未剥离客户端 XFF 的路径上，轮换伪造 IP 可掏空配额。 |
| **推荐操作** | Vercel 优先平台 IP / 受信头；忽略终端用户自带 XFF，除非受信代理 CIDR。单测：伪造 XFF 不改变 bucket key。 |
| **验证** | 两请求同连接不同 XFF → 同一限流桶（或平台 IP）。 |
| **预期收益** | 限流重新有效。 |

---

### BE-4 · P1 · submit 限流 fail-open

| 项 | 内容 |
|----|------|
| **问题描述** | `app/api/submit/route.ts:17` 调 `checkRateLimit` 未传 `failClose`；`lib/rate-limit.ts:146-148` 默认 DB 失败 → `allowed: true`。login 已 fail-close。 |
| **影响评估** | RPC/库故障窗口内可无限 insert pending 链接（service_role）。 |
| **推荐操作** | `checkRateLimit(..., true)`；favorites/reviews 写路径同策略评估。 |
| **验证** | mock RPC error → submit 429/503 而非 200。 |
| **预期收益** | 故障时仍有滥用边界。 |

---

### BE-5 · P1 · 分布式限流未配置时退化为进程内存

| 项 | 内容 |
|----|------|
| **问题描述** | `lib/rate-limit-distributed.ts`：无 Upstash 或 Redis 错误 → memory；search/favicon/resource-search 使用。多实例有效配额 ≈ max×instances。 |
| **影响评估** | Vercel 水平扩展下限流形同虚设；embed/上游成本放大。 |
| **推荐操作** | 生产强制 Upstash；health/launch-readiness 检查；昂贵路由 Redis 失败时 fail-closed 或更严本地 cap。 |
| **验证** | 两实例交错打满 → 总成功 ≈ max；断 Redis 有告警/拒绝。 |
| **预期收益** | 跨实例真实配额。 |

---

### BE-6 · P1 · 资源库读客户端可回落 service_role

| 项 | 内容 |
|----|------|
| **问题描述** | `lib/resource-library/client.ts:42-59`：无 anon → 用 service_role 读 `pages`；且默认 URL 硬编码生产 RL 项目。 |
| **影响评估** | 误配置时公开浏览路径持有全库权限；环境错绑风险。 |
| **推荐操作** | 生产强制 `RESOURCE_LIBRARY_ANON_KEY`；缺失则 null/503；URL 无默认（或仅 test flag）；health 报告 credential。 |
| **验证** | 去掉 anon → browse 503；有 anon → 200 且日志 `credential=anon`。 |
| **预期收益** | 最小权限；防错环境。 |

---

### BE-7 · P1 · 搜索冷路径每次构建全量 Fuse 池

| 项 | 内容 |
|----|------|
| **问题描述** | `lib/search/fuse.ts` → `getApprovedLinks()` 全表 + tags；进程内 60s cache；语义路径并行仍建池（`use-case.ts`）。 |
| **影响评估** | N 增大时 p95/内存线性恶化；多实例 cache stampede。 |
| **推荐操作** | 关键词走 DB FTS/RPC；Fuse 仅小语料；池放 Redis；语义 RPC 加 `p_category_slug` 避免过取（`semantic.ts` 现 JS 过滤）。 |
| **验证** | 目录 2× 时 search p95 不接近 2×；category 语义 SQL 侧过滤。 |
| **预期收益** | 稳定延迟；降 DB/CPU。 |

---

### BE-8 · P1 · resource-ratings 限流 check-then-act

| 项 | 内容 |
|----|------|
| **问题描述** | `app/api/resource-ratings/route.ts`：`count(*)` 再 `INSERT`，无 `consume_rate_limit`/窗口唯一约束。 |
| **影响评估** | 并发可突破「10/15min」；service_role 写绕过 RLS。 |
| **推荐操作** | 写入前 `consume_rate_limit`；可选 `(ip, page_id, window)` 唯一。 |
| **验证** | 并行 20 请求 → 成功 ≤10。 |
| **预期收益** | 真实配额；减刷分。 |

---

### BE-9 · P2 · favorites 全程 service_role，RLS 形同旁路

| 项 | 内容 |
|----|------|
| **问题描述** | NextAuth `user.id` + 全 service_role 读写；RLS 按 Supabase Auth JWT 设计（`migration-user-favorites`）。 |
| **影响评估** | 应用层漏 `.eq(user_id)` 即成跨用户读写；RLS 兜不住。 |
| **推荐操作** | 专用 RPC 仅接受 session sub；或接 Supabase Auth；FORCE RLS + 负向单测。 |
| **验证** | 伪造他者 userId 的集成测失败。 |
| **预期收益** | 纵深防御。 |

---

### BE-10 · P2 · CSRF 允许缺 Origin；`/api/tools` 无限流

| 项 | 内容 |
|----|------|
| **问题描述** | `lib/csrf.ts` 无 Origin 放行；tools 路由无限流，RPC 缺失时 fallback 可全表（`links.ts` queryApprovedLinksForApi）。 |
| **影响评估** | 依赖 SameSite；爬取/放大面。 |
| **推荐操作** | cookie 写 API 强制 Origin/Referer 或 CSRF token；tools 加分布式限流；生产 RPC 缺失 fail-closed。 |
| **验证** | 无 Origin 的 cookie POST → 403；tools 打满 429。 |
| **预期收益** | 写路径更硬；读路径可预期。 |

---

## 3. 整体架构建议

### 3.1 当前形态

```
Browser → Vercel (Next 16 App Router)
            ├─ Supabase nav（单库 · ADR-001）
            ├─ Supabase RL（第二项目 · 资源页）
            ├─ Search: Fuse 进程池 + semantic RPC
            └─ Embed: 默认 Worker→Tunnel→本机 BGE
                 可选: Cloudflare Workers AI 1024-d（S0 SQL 已备）
```

**优点：** 域边界清晰；降级路径（embed→FTS、Upstash→memory）；Vercel 主轨 + Netlify 紧急门控；runbook/探针/S0 约束已工程化。

**风险：**

1. **语义 SPOF** — 默认本机 origin；关机即 embedding error（health 默认可仍 healthy）。  
2. **双后端** — RL 第二项目 + service_role 读回落。  
3. **Serverless 限流** — 无 Upstash 时按实例放大。  
4. **客户端全量岛** — 目录规模的隐式架构上限。  
5. **文档漂移** — README/清单仍可能写 Netlify 心智。

### 3.2 可落地方向

| 方向 | 步骤 | 预期收益 |
|------|------|----------|
| **A. 嵌入常开** | 跑通 CF 1024-d backfill + Vercel env 切换，或 Fly/VPS 托管 BGE；`HEALTH_REQUIRE_EMBEDDING` 按阶段打开 | 语义 24×7 |
| **B. 搜索服务化** | 关键词 FTS RPC；Fuse 退出主路径；池共享缓存 | p95 与 N 解耦 |
| **C. 前端切片** | 首屏 SSR 切片 + 虚拟列表；Favorites 真 API | 水合/INP |
| **D. 权限收敛** | 512-d RPC 授权；RL anon-only；favorites RPC | 攻击面收缩 |
| **E. 观测闭环** | Sentry release=SHA；探针默认自定义域；embedding 必 ok 分环境 | 故障可发现 |

**明确不做（仍适用）：** 全量 BEM rewrite；为 <1k 文档上 Meili/ES；无 RUM 的假 p75。

---

## 4. 配置优化

### CFG-1 · P0/P1 · 嵌入与健康语义（架构交叉）

| 项 | 内容 |
|----|------|
| **问题描述** | 默认 `EMBED_SERVER` 链到本机；health 默认 embedding 失败不整体 unhealthy。 |
| **影响评估** | 静默降级；语义「看起来有、实际无」。 |
| **推荐操作** | 完成 CF/VPS；分环境 `HEALTH_REQUIRE_EMBEDDING`；探针 `--require-embedding` 进 smoke。 |
| **验证** | 本机关机 15min 内告警或探针红；恢复后绿。 |
| **预期收益** | 语义可用性可运营。 |

---

### CFG-2 · P1 · 文档与生产轨不一致

| 项 | 内容 |
|----|------|
| **问题描述** | `PRODUCTION-RUNBOOK` 已 Vercel 主轨；部分 README/LAUNCH 清单仍 Netlify credit 叙事。 |
| **影响评估** | 错误恢复路径、空触发 Netlify。 |
| **推荐操作** | 清单/README 统一 Vercel；Netlify 仅 emergency + `ALLOW_NETLIFY_MIRROR`。 |
| **验证** | 全文检索「生产部署」仅 Vercel 主路径。 |
| **预期收益** | 运维零歧义。 |

---

### CFG-3 · P1 · CSP `script-src 'unsafe-inline'`

| 项 | 内容 |
|----|------|
| **问题描述** | `next.config.ts` securityHeaders（及 Netlify 镜像）允许 inline script。 |
| **影响评估** | XSS 一旦出现即可执行。 |
| **推荐操作** | Next nonce/hash；与 Netlify CSP 同源生成；收紧 GA。 |
| **验证** | CSP report-only → enforce；无新增 violation。 |
| **预期收益** | XSS 利用门槛升高。 |

---

### CFG-4 · P1 · Upstash 与覆盖率门槛

| 项 | 内容 |
|----|------|
| **问题描述** | Upstash 可选；`vitest.config.ts` lines/statements 50、fn/branch 40。 |
| **影响评估** | 生产限流弱；回归预算过大。 |
| **推荐操作** | Vercel 配齐 REST URL/TOKEN；coverage 阶梯 60→70。 |
| **验证** | CI 在阈值下绿；断 Redis 行为符合 fail 策略。 |
| **预期收益** | 真实配额 + 更早捕获回归。 |

---

### CFG-5 · P2 · Auth beta、env 模板分叉、LH 重建

| 项 | 内容 |
|----|------|
| **问题描述** | `next-auth@5.0.0-beta.31`；`.env.example` 与 `.env.local.example` 分叉；Lighthouse workflow 独立 rebuild + `npx @lhci/cli@0.15.x` 浮动。 |
| **影响评估** | API 漂移；漏配 env；CI 慢且不可复现。 |
| **推荐操作** | 跟 Auth.js 稳定版；单一 env 矩阵；LHCI 钉死 devDependency、复用 build artifact。 |
| **验证** | 依赖审计干净；CI 时长下降；LH 版本固定。 |
| **预期收益** | 供应链与 CI 确定性。 |

---

### CFG-6 · P2 · 探针默认 base 与 CDN 缓存语义

| 项 | 内容 |
|----|------|
| **问题描述** | 探针默认 `nav-site-kappa.vercel.app`；CF 可改写 `Cache-Control` 为 max-age，依赖 `cdn-cache-control: no-store`（`56941d27`+`96e58a20` 已处理）。 |
| **影响评估** | smoke 不扫自定义域则漏 CF 层问题。 |
| **推荐操作** | production-smoke 默认 `yuanjia1314.ccwu.cc`；CF purge token 修好后部署后 purge。 |
| **验证** | 定时 smoke 日志含自定义域；部署后 build-info commit 对齐。 |
| **预期收益** | 端到端真实用户路径覆盖。 |

---

## 5. 优先修复顺序（可执行清单）

1. **生产 SQL（今日）**  
   - REVOKE/GRANT `update_link_embedding`、`search_links_semantic`  
   - 验证 grantee  
2. **代码 T0/T1（1–2 日）**  
   - submit failClose；Favorites API 契约；browse 筛选；flatResults 去重  
3. **配置 T2（依赖账号）**  
   - Upstash；可信 IP；RL anon 强制  
4. **架构 T3（依赖主机）**  
   - Cloudflare/VPS embed；CSP；文档归一；coverage  

### 验证总闸

```powershell
cd D:\nav-site
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run test:coverage
pnpm run build
pnpm run verify:production -- --base-url https://yuanjia1314.ccwu.cc --expect-commit <deployed-sha>
# 可选：--require-embedding（embed 常开后）
```

---

## 6. 附录 · 生产 RPC 授权抽查（2026-07-16）

| 函数 | security_definer | EXECUTE grantees |
|------|------------------|------------------|
| `update_link_embedding` | **true** | **PUBLIC, postgres** ← P0 |
| `search_links_semantic` | false | **PUBLIC, postgres** ← P0 |
| `update_link_embedding_v2` | false | postgres, service_role |
| `search_links_semantic_v2` | false | postgres, service_role |
| `batch_update_embeddings` | false | postgres, service_role |
| `batch_update_embeddings_v2` | false | postgres, service_role |

S0 对象（click_rate_limits、rate_limit_buckets、url unique、list_public_tools、embedding_1024）已在 migration `20260716154035_audit_s0_s3_constraints_and_1024d_path` 应用。

---

*本报告基于 `96e58a20` 源码与生产只读抽查，不构成渗透测试结论。落地时每条建议应有对应测试或 SQL 验证行。*
