# ChronoPortal · 长波债务表（Phase0 scout）· 2026-07-24

> **模块：** `M-CP-scout-lw` · 分支 `xvyimu/cp-scout-lw` · tip **`df11a2f2`**  
> **边界：** 只读扫描 + 本目录文档；**无**业务实现 · **无** 生产/Preview env 写入 · **无** CSP/RLS flip · **无** push  
> **证据日：** 2026-07-24（本 wt 探针 + 已合入 ops 文档链）

---

## 0. 一句话风险

**Preview `*.vercel.app` 仍 TCP 不可达 + 生产 runtime 钉在 `46e71ec`（落后 tip ≥ 安全/测试修）时，CSP Stage A / 生产安全闭环被网络与部署双阻断；最大 DB 面仍是 `model_rankings` public 写 policy，须人 gate 单独 RLS 波次。**

---

## 1. 扫描基线

| 项 | 值 |
|----|-----|
| 工作树 tip | `df11a2f2` `test: stabilize search/favicon/resource-library mocks` |
| 生产 `/build-info.json` | commit **`46e71ec38e3828b892058f7e059f88478807434b`** · deploy `dpl_rGFZxkqt…` · `generatedAt` 2026-07-22 |
| 生产 `/` HEAD | **200** · CSP enforce **含** `script-src … 'unsafe-inline'` · **无** `nonce-` · RO 在线 · `x-frame-options: SAMEORIGIN` · `referrer-policy: same-origin` |
| 生产 `/api/health` | **healthy** · DB/env/Sentry/Upstash/embedding **ok** · `resourceLibrarySearch` **error**（RPC unavailable） |
| Preview 例 `nav-site-lk16isapm-aijiai520.vercel.app` | **timeout** · curl exit **28** · `http_code=000` |
| `pnpm typecheck` | **SKIP** · 本 wt **无** `node_modules`（禁装依赖爆炸） |
| 栈锁（package.json） | Next **16.2.11** · React **19.2.8** · next-auth **5.0.0-beta.32** · webpack 本地 3264 |
| 必读链 | PROJECT · PRODUCT-LAYERS · AGENT-CONTINUE · L2-P0 · Stage A prep · w4 security index · csp-t9 · ADR 003/004/006/009 · day-sec · nextauth-sec · flaky-search · RLS matrix |

---

## 2. 债表（按优先级）

图例：**Sev** P0=阻断安全/合规闭环 · P1=高风险可利用/部署漂移 · P2=架构/运维债 · P3=产品/规模触发  
**状态** OPEN | BLOCKED | ACCEPT | DEFER | DONE（已修未部署仍记 OPEN-deploy）

| ID | Sev | 域 | 摘要 | 证据 | 状态 | 建议模块 |
|----|-----|-----|------|------|------|----------|
| **D-CSP-01** | P0 | CSP | Preview Stage A **未跑**：本机/`agent` → `*.vercel.app` connect timeout；故意不写 Preview `CSP_DYNAMIC` | Stage A prep §6 · blocker 2026-07-23 · **本会话 curl exit 28** | **BLOCKED** | M-CP-stage-a-net |
| **D-CSP-02** | P0 | CSP | 生产 **未** `CSP_DYNAMIC` / **未** 去 script `unsafe-inline`；T9 默认暂缓；`CP_CSP_prod` 人 gate | csp-t9 · w3 dossier · w4 index · 生产头无 nonce | **DEFER**（人 gate） | M-CP-csp-prod-gate |
| **D-CSP-03** | P1 | CSP | tip 上 T9″ nonce 路径 + csp-report 修 **未** 上生产（prod 仍 `46e71ec`） | build-info vs tip `df11a2f2` | **OPEN-deploy** | M-CP-prod-deploy |
| **D-RLS-01** | P0 | RLS | **`model_rankings`**：public INSERT/UPDATE/DELETE + GRANT 写 → 高风险 | w3-rls §3–4 · advisor `rls_policy_always_true` | **OPEN**（flip NOT EXECUTED） | M-CP-rls-rankings |
| **D-RLS-02** | P2 | RLS | 多表 RLS on **无 policy** + 部分宽 GRANT（pages/resources/dedup…）；FORCE RLS 不全 | w3-rls inventory | **OPEN** | M-CP-rls-hygiene |
| **D-RLS-03** | P2 | RLS | SECURITY DEFINER 可被 anon 执行（`increment_click` / `get_cat_memories` 等） | w3-rls §3.5 | **OPEN** | M-CP-rls-hygiene |
| **D-HDR-01** | P1 | Headers | 生产头 **DRIFT**：XFO `SAMEORIGIN`≠`DENY`；Referrer `same-origin`≠`strict-origin-when-cross-origin`；边缘 `expect-ct` 等 | 本会话 HEAD · headers-drift-trace | **OPEN**（平台层） | M-CP-headers-platform |
| **D-AUTH-01** | P2 | Auth | next-auth 仍 **beta.32**（无 stable 5）；ADR-007 风险接受；Dependabot 线已最小 bump | package.json · cp-nextauth-sec · ADR-007 | **ACCEPT** | —（触发再开） |
| **D-FAV-01** | P1 | Authz | favorites 用 **service_role** 绕 RLS；应用层 session.user.id 隔离；缺 JWT/RPC 纵深 | `lib/repositories/favorites.ts` 注释 · day-sec #5 · AGENT-CONTINUE F | **OPEN** | M-CP-favorites-jwt |
| **D-RL-01** | P2 | 限流 | `checkRateLimit` 调用须显式 `failurePolicy`；默认/误用 fail-open 风险（敏感路径） | day-sec #2 · `lib/rate-limit.ts` | **OPEN** | M-CP-rate-limit-policy |
| **D-RL-02** | P2 | 限流 | 分布式限流默认 **fail-open→memory**；多实例配额 ×N；生产严格需 `DISTRIBUTED_RATE_LIMIT_FAIL_CLOSED=1` | Stage A prep §4.3 · day-sec #4 | **ACCEPT**/文档 | M-CP-rate-limit-ops |
| **D-RL-03** | P3 | 限流 | 废弃 `checkClickRateLimit` DB 错时 allow 路径仍在库中 | day-sec #3 | **OPEN** | M-CP-rate-limit-policy |
| **D-TEST-01** | P2 | CI/测 | 宿主注入 `UPSTASH_*` 曾污染 search/favicon/resource 测；本 tip 已清 env 稳定 | cp-flaky-search · tip `df11a2f2` | **DONE**（代码）/ **OPEN-deploy** | — |
| **D-TEST-02** | P3 | CI/测 | 全局测试卫生：所有限流相关测应默认清 Upstash；防回归 | flaky-search 模式 | **OPEN** | M-CP-test-hygiene |
| **D-HLTH-01** | P1 | 运行 | 生产 health：`resourceLibrarySearch` **error**（public resource search RPC unavailable） | 本会话 `/api/health` | **OPEN** | M-CP-resource-rpc |
| **D-ARCH-01** | P3 | 架构 | repository facade 已拆域（ADR-003/006）；facade 仅 re-export — 低危；防再塞实现 | `lib/repositories.ts` · ADR-006 | **ACCEPT** | — |
| **D-ARCH-02** | P3 | 架构 | 搜索 Fuse 全量池 / 虚拟列表：规模触发后拆 | backlog T7/T10 · AGENT-CONTINUE 延后项 | **DEFER** | M-CP-search-scale |
| **D-ARCH-03** | P3 | 架构 | Admin 边界 ADR-009 已落地；保持 boundary 测 | admin-boundary tests | **ACCEPT** | — |
| **D-PAY-01** | P2 | 产品 | checkout/webhook 桩：`ENABLE_PAYMENTS_API` 误开 → 501 无签名 | day-sec #6 | **ACCEPT** 至真支付 | M-CP-payments（未来） |
| **D-CSP-04** | P3 | CSP | csp-report：`original-policy` 全文仍可能进采样日志（path-only 已做 URI） | Stage A prep §7.4 | **OPEN** residual | M-CP-csp-report-hygiene |
| **D-OPS-01** | P1 | 运维 | 生产 tip **落后**：安全修（csp-report 参数序、Retry-After、URI 脱敏）、next-auth bump、flaky 测稳定 **均未** 进生产 runtime | tip vs `46e71ec` | **OPEN-deploy** | M-CP-prod-deploy |
| **D-OPS-02** | P2 | 运维 | 三库 key 串库陷阱（User env 常挂 RL service role） | AGENT-CONTINUE §2 | **ACCEPT**/文档 | — |
| **D-EDGE-01** | P3 | 边缘 | Rocket Loader off / mangled=0 已清；需周期性 `audit-edge-scripts` | L2-P0 · cloudflare-edge doc | **ACCEPT** 周期 | M-CP-edge-audit |
| **D-ING-01** | P3 | 架构 | ingest/embedding 出请求路径（队列/job）H2 backlog B3 · **0% 实现** | stack-matrix B3 | **DEFER** | M-CP-ingest-boundary |

---

## 3. 已关闭 / 近期落地（勿重复开工）

| 项 | tip / 证据 |
|----|------------|
| csp-report 限流参数序修复 | `adb8d306` |
| 限流拒绝 204 + `Retry-After: 60` | `68dd13dd` |
| csp-report URI path-only 脱敏 | `24439d1b` |
| CI `pnpm audit --audit-level=high` + 契约测 | `e028483e` · `b4865cbb` |
| next-auth β.32 / @auth/core 0.41.3 | `e551d2c0` |
| 搜索/favicon/resource 测 Upstash 隔离 | `df11a2f2` |
| T9′ GA 外置 + T9″ nonce 代码路径（默认关） | csp-t9 · 生产未开 |
| CF Rocket Loader off | AGENT-CONTINUE · 2026-07-22 |

---

## 4. 硬红线（长波全程）

| 禁止 | 原因 |
|------|------|
| 生产 `CSP_*` env / 默认 flag 放松 | 人 gate + Stage A 未绿 |
| 生产 RLS DDL / policy flip | 须「RLS flip 现在」+ 非生产演练 |
| 与 CSP 生产 flip 同会话无授权并行 RLS | w3/w4 协议 |
| 盲改 Next 假装消除 headers DRIFT | 平台层覆盖 |
| 去 `--webpack` / 换栈平行实现 | PROJECT SSOT |
| 本 scout 开工实现模块 | 只产出 DEBT + DISPATCH |

---

## 5. 交叉引用

| 资源 | 路径 |
|------|------|
| 模块拆分 | [`DISPATCH.md`](./DISPATCH.md) |
| Stage A 预备 | `docs/ops/cp-preview-stage-a-prep-2026-07-24.md` |
| 生产安全索引 | `docs/ops/w4-prod-security-index.md` |
| RLS 矩阵 | `docs/ops/w3-rls-prod-matrix-prep.md` |
| T9 决策 | `docs/csp-t9-decision-2026-07-22.md` |
| H2 backlog B1–B3 | `docs/ops/stack-matrix-2026-07.md` |
| DAY 安全面 | `docs/ops/cp-day-sec-surface-2026-07-24.md` |

---

## 6. Scout 元数据

| 项 | 值 |
|----|-----|
| 作者角色 | Phase0 scout · `M-CP-scout-lw` |
| 写权限 | 仅 `docs/ops/cp-long-wave/*` |
| typecheck | 未跑（无 node_modules） |
| 生产探针 | **PASS**（home/health/build-info/robots） |
| Preview 探针 | **BLOCKED**（timeout） |
| 下一闸 | 总控 `cp-coord` G0 审 DEBT+DISPATCH 后派工 |
