# ChronoPortal · L2 安全/运维 Hygiene 清单

> **角色**：L2 内容遗留 · **维持 Next**（禁止 Vue/Go 换栈重写）  
> **依据**：`D:\orca\docs\portfolio-side-track-2026-07-22.md` · `architecture-decision-2026-07-22-approved.md` §5  
> **仓库/分支**：本 worktree `xvyimu/cp-2` · 文档 SHA 以 git tip 为准  
> **生产**：`https://yuanjia1314.ccwu.cc` · 运行时 tip 以 `GET /build-info.json` 为准  
> **本清单性质**：**只读 hygiene + 可执行检查**；不含生产破坏、计费改动、不默认 push  
> **最后校准**：2026-07-22（对照 tip 含 T9′ CSP / CF Rocket Loader off）

---

## 0. 范围与不做

| 做 | 不做 |
|----|------|
| CSP / Admin 鉴权 / Supabase·RLS / 依赖审计的**现状与缺口** | 整站换栈、旗舰级重写 |
| P0–P2 可落地项与验收命令 | 抢 TransitHub 模块二范围 |
| 小步文档/清单 commit | 默认 `git push`、DB 破坏性迁移、密钥外发 |

关联文档（已有、勿重复造轮）：

| 主题 | 文档 |
|------|------|
| CSP T9 决策 | `docs/csp-t9-decision-2026-07-22.md` |
| CF 边缘 | `docs/cloudflare-edge-csp-hardening-2026-07-22.md` |
| 发布短清单 | `docs/LAUNCH-CHECKLIST.md` |
| 生产手册 | `docs/PRODUCTION-RUNBOOK.md` |
| 安全政策 | `SECURITY.md` |
| 全栈审计（历史） | `docs/full-stack-audit-2026-07-17.md` |
| RLS SQL | `scripts/rls-audit.sql` |

---

## 1. CSP · Nonce 与策略

### 1.1 现状（代码事实）

| 项 | 状态 | 位置 |
|----|------|------|
| 静态 CSP（默认生产路径） | **在线** | `next.config.ts` → `buildCspHeaderPairs()` |
| Enforcing `script-src` 含 `'unsafe-inline'` | **默认 on** | `lib/csp.ts` · `CSP_SCRIPT_UNSAFE_INLINE` 默认 true |
| Report-Only（无 script unsafe-inline） | **默认 on** | `CSP_REPORT_ONLY` · 上报 `/api/csp-report` |
| Nonce 生成 + builder | **就绪** | `createCspNonce()` · `'nonce-…'` + `'strict-dynamic'` |
| 动态 CSP 挂载（middleware/proxy） | **未默认开** | `CSP_DYNAMIC` 默认 false；`proxy.ts` **仅** Admin 鉴权 matcher |
| layout / `<Script nonce>` 透传 `x-nonce` | **未接** | 见 T9 决策 §4 — 避免半吊子双头 |
| GA bootstrap | **已外置** | `components/Analytics.tsx` + `app/api/ga` |
| CF Rocket Loader / mangled type | **已清**（2026-07-22） | `rocket_loader=off` · `audit-edge-scripts.mjs` mangled=0 |

### 1.2 操作检查

```powershell
# 单元
pnpm exec vitest run tests/csp.test.ts tests/api-csp-report.test.ts tests/api-ga.test.ts

# 边缘（生产 HTML）
node scripts/audit-edge-scripts.mjs
# 期望: mangledScriptTypeCount === 0, rocketLoaderHints === false

# 生产探针（需网络）
pnpm run verify:production -- --no-proxy --base-url https://yuanjia1314.ccwu.cc
```

### 1.3 红线

- **禁止**在无 nonce→layout 接线时默认 `CSP_SCRIPT_UNSAFE_INLINE=0`。
- **禁止**生产开 `CSP_DYNAMIC=1` 却未完成 proxy 发头 + layout 透传（会双头或无 CSP）。
- style-src `'unsafe-inline'` 与 script 策略**分开**；本清单不要求本轮改 style。

### 1.4 后续（T9″ cutover，仍属 hygiene 跟踪，非本轮必做）

1. `proxy.ts`（或 middleware）在 `CSP_DYNAMIC=1` 时注入 nonce + CSP 头。  
2. layout 读 `x-nonce` 挂 Next `<Script nonce>`。  
3. Preview 金丝雀 `CSP_SCRIPT_UNSAFE_INLINE=0`。  
4. Sentry `source:csp-report` 1–2 天可解释后生产切换 + 回滚写 runbook。

---

## 2. Admin 鉴权

### 2.1 现状（代码事实）

| 层 | 行为 | 位置 |
|----|------|------|
| 边缘门闩 | `role === "admin"` 才进 `/admin/*`、`/api/admin/*`；否则 401 / 跳转 `/login` | `proxy.ts` matcher |
| Handler 二次确认 | `requireAdmin()` → session + `role === "admin"` | `lib/with-admin.ts` |
| 写操作 CSRF | `checkOrigin` on POST/PUT/DELETE | `withAdminWrite` / `withAdminDelete` |
| 输入 | Zod schema + UUID id 包装器 | `withAdminIdWrite` / `withAdminIdDelete` |
| 登录 | NextAuth Credentials；IP 限流 15min/5；恒定延迟；失败 deny | `lib/auth.ts` |
| 密码 | 优先 `ADMIN_PASSWORD_HASH`（scrypt）；过渡明文 `ADMIN_PASSWORD` + timingSafeEqual | `lib/admin-password.ts` |
| JWT | `AUTH_SECRET` 签名；默认 role=`user` | NextAuth callbacks |
| GitHub OAuth | 可选；profile **强制** `role: "user"`（不能经 OAuth 提权 admin） | `lib/auth.ts` |

### 2.2 检查清单

- [ ] 所有 `app/api/admin/**` 经 `withAdmin*` 或等价 `requireAdmin()`（禁止裸 handler）  
- [ ] Admin 页面 Server Action / 直连 DB 不绕过 session  
- [ ] 生产 env：`AUTH_SECRET` 足够熵；优先 **只** 配 `ADMIN_PASSWORD_HASH`（弃用明文）  
- [ ] Preview 与生产 **不同** 密码哈希  
- [ ] Cookie：httpOnly + secure + sameSite=lax（Auth.js 默认路径）  
- [ ] 登录爆破：限流表/RPC 故障时 **deny**（非 fail-open）——见 `checkRateLimit(..., "deny")`

### 2.3 验证命令

```powershell
pnpm exec vitest run tests/security.test.ts tests/admin-password.test.ts tests/api-admin-links.test.ts tests/admin-id-route-wrapper.test.ts
# 可选 e2e（需本地/preview 凭据，勿写死密钥）
# pnpm run e2e:admin
```

### 2.4 已知风险（跟踪）

| 风险 | 级别 | 说明 |
|------|------|------|
| 单管理员 Credentials 共用 `id: "admin"` | P2 | 无多租户审计主体；可接受于 L2 内容站 |
| 明文 `ADMIN_PASSWORD` 过渡 | P1 | 生产应只留 hash；见 runbook |
| `proxy.ts` matcher 未覆盖非 `/api/admin` 的敏感写路径 | P1 | 新增管理面必须扩 matcher + withAdmin |

---

## 3. Supabase / RLS 注意点

### 3.1 客户端边界

| 客户端 | Key | 用途 | 约束 |
|--------|-----|------|------|
| `createClient()` | anon + cookies | 用户态 / SSR | 遵守 RLS |
| `createStaticClient()` | anon 无 cookie | ISR/sitemap/详情 SSG | **禁止**触发动态 `cookies()`；详情页须显式注入 |
| `createServiceRoleClient()` / `createAdminClient()` | **service_role** | Admin 写、限流、语义搜索 RPC 等 | **仅服务端**；永不进 client bundle |

配置：`lib/supabase/config.ts`  
- URL / anon：`NEXT_PUBLIC_SUPABASE_*`  
- service：`SUPABASE_SERVICE_ROLE_KEY` 或 `SUPABASE_SERVICE_ROLE_KEY_PROD`

### 3.2 RLS / 权限期望（单库 · ADR-001）

在 Supabase SQL Editor 跑 `scripts/rls-audit.sql`，对照：

| 检查 | 期望 |
|------|------|
| public 表 RLS | 关键业务表 **enabled**（必要时 forced） |
| anon 对 `nav_links` / `nav_categories` | SELECT 仅公开/已批准；**无** 随意 INSERT/UPDATE/DELETE |
| anon 写 | 仅限流相关表（如 `submit_attempts` / `login_attempts` / `click_rate_limits`）按策略 |
| Admin 写 | 经 **service_role** 服务端路径，不依赖浏览器持有 service key |
| 新表 | 合并前必须：RLS on + 最小 policy + 迁移脚本入库 |

### 3.3 高危模式（审计已点名，仍跟踪）

| 模式 | 风险 | 处置方向 |
|------|------|----------|
| 公开 GET 在 RPC 失败时回退 **service_role** 读 | 扩大密钥爆炸半径、掩盖公开契约故障 | 失败应 5xx/降级，**不**抬权（见 full-stack-audit B-01） |
| 限流/收藏等大量 `createServiceRoleClient()` | service 面过宽 | 能 RLS 完成的用 anon；service 仅写白名单操作 |
| 仓库默认 client 未注入时 `createClient()` 读 cookies | 静态页变动态 → 生产 500 | 详情/ISR 路径固定 `createStaticClient()`（已有回归，保持） |
| Resource Library 跨项目 service client | 密钥与 blast radius 独立 | 与主导航 env 分离；公开路由禁止静默抬权 |

### 3.4 检查命令

```powershell
# 本地/CI 契约（不连真库也可跑 mock 测）
pnpm exec vitest run tests/repositories.test.ts tests/api-security.test.ts tests/api-health.test.ts

# 真库（SQL Editor）：粘贴 scripts/rls-audit.sql
# 迁移存在 ≠ 生产已执行 — 以 staging/prod schema 实查为准
```

---

## 4. 依赖与供应链审计

### 4.1 命令

```powershell
# 已知漏洞（moderate+）；脚本已 pin npm registry
pnpm run audit:security

# 锁文件一致性（CI 应 frozen）
pnpm install --frozen-lockfile

# 类型/单测门禁（改依赖后）
pnpm run typecheck
pnpm test
```

### 4.2 卫生约定

| 项 | 约定 |
|----|------|
| 包管理器 | `pnpm@11.5.0`（`packageManager` 字段） |
| 锁文件 | 只提交 `pnpm-lock.yaml`；禁止手改后无 `pnpm install` |
| Next / React | 当前 `next@16.2.9` · `react@19.2.4` — 升级走小步 + 全测，**不**借机换栈 |
| Auth | `next-auth@5.0.0-beta.31` — 跟官方安全通告 |
| Supabase | `@supabase/ssr` / `supabase-js` pin 版本；升级对照 RLS 行为 |
| 密钥扫描 | 提交前 `scripts/pre-commit-secret-scan.mjs`（若 hook 启用） |
| 第三方脚本 | 仅 CSP allowlist（GTM/GA/Sentry ingest）；禁止新任意 CDN 脚本 |

### 4.3 发版前最小依赖门

- [ ] `pnpm run audit:security` 无 moderate+（或已记豁免理由 + 到期日）  
- [ ] 无新增 `NEXT_PUBLIC_*` 泄露 service/密钥  
- [ ] `.env*` 未入库（仅 `*.example`）

---

## 5. P0–P2 清单（L2 hygiene · 2026-07-22）

优先级定义：

- **P0**：可直接导致未授权/数据破坏/生产不可用，应尽快修  
- **P1**：扩大攻击面或发布门禁缺口，计划内修  
- **P2**：硬化/可观测/债务，不阻塞内容站维持

### P0

| ID | 项 | 状态线索 | 验收 |
|----|-----|----------|------|
| P0-1 | 公开路由 **禁止** service_role 静默回退（ratings 等） | 审计 B-01 仍跟踪 | 公开 GET 失败不调用 service client；有测 |
| P0-2 | Admin API 无鉴权裸露 | withAdmin + proxy 双层 | 未登录 401；测覆盖 |
| P0-3 | service_role / `AUTH_SECRET` / 管理密码 **不进** 客户端与 git | config 服务端 only | bundle/grep + secret scan |
| P0-4 | 生产工具详情等 ISR 不因 `cookies()` 动态化 500 | `createStaticClient` 注入 | `/tool/*` 200 + 探针 |

### P1

| ID | 项 | 状态线索 | 验收 |
|----|-----|----------|------|
| P1-1 | CSP T9″：nonce→layout + 可回滚去 `'unsafe-inline'` | Builder 好；挂载未开 | Preview 金丝雀 + RO 样本 |
| P1-2 | 生产仅 `ADMIN_PASSWORD_HASH` | 过渡明文仍可能存在 | env 审计 + 登录 e2e |
| P1-3 | RLS 定期审计 + 新表 policy | `rls-audit.sql` | SQL 输出存档（不入库密钥） |
| P1-4 | 限流 fail-open 路径收敛 | 登录已 deny；其他路径核查 | 故障时安全默认有测 |
| P1-5 | CF 边缘改写回归 | Rocket Loader 已 off | `audit-edge-scripts.mjs` 进发版检查 |
| P1-6 | `pnpm audit` 进 CI 或发版清单 | 有 script | LAUNCH 勾选 |

### P2

| ID | 项 | 状态线索 | 验收 |
|----|-----|----------|------|
| P2-1 | CSP Report-Only 聚类看板（Sentry） | 采样 1/20 | 周维度可解释 |
| P2-2 | Admin 操作审计日志（谁改了什么） | 现单 admin | 结构化 logger 字段 |
| P2-3 | service_role 调用点清单收敛 | favorites/rate-limit/search 等 | 文档化白名单 |
| P2-4 | API 文档与真实契约对齐 | 历史漂移 | OpenAPI 生成 + 抽检 |
| P2-5 | 覆盖率阈值缓升 | 审计时 ~60% stmt | vitest 阈值小步上调 |
| P2-6 | 依赖主版本升级节奏（Next 16 安全补丁） | pin 中 | 月度 audit 记录 |

---

## 6. 一键自检（本机）

```powershell
# 从仓库根
pnpm run typecheck
pnpm test
pnpm run audit:security
pnpm exec vitest run tests/csp.test.ts tests/security.test.ts tests/api-security.test.ts

# 有生产网络时
node scripts/audit-edge-scripts.mjs
pnpm run verify:production -- --no-proxy --base-url https://yuanjia1314.ccwu.cc
```

任一门禁失败：**禁止**宣称 hygiene 通过；先修或登记豁免（原因 + 到期）。

---

## 7. 变更纪律（L2）

1. **维持 Next** — 架构决策已批；Better-wins 须有证据，本清单本身不是换栈授权。  
2. 安全小修可开 `feature/*`；文档/清单可小步 commit，**不默认 push**。  
3. 涉及生产 env、DNS、DB 迁移、CF token：走 `docs/PRODUCTION-RUNBOOK.md`，先确认影响。  
4. 与 TransitHub 抢资源时 **TH 优先**。

---

## 8. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-22 | 初版：CSP nonce / Admin / Supabase·RLS / 依赖 / P0–P2；对齐 T9′ 与 CF 边缘清理后的代码事实 |
