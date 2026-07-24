# ChronoPortal · 长波模块拆分（Phase0 scout）· 2026-07-24

> **来源债表：** [`DEBT.md`](./DEBT.md)  
> **总控：** `cp-coord` G0 审后派工 · 本文件 **不** 授权开工实现  
> **栈锁：** Next16 + webpack + React19 + shadcn + Supabase RLS + Auth.js v5 · 本地 3264 `--webpack`  
> **全局红线：** 无 push（除非总控另授）· 无生产 CSP/RLS flip · 无绕 RLS · 无改它仓 · 无装依赖爆炸

---

## 0. 派工原则

1. **一模块一红线面**：CSP 生产 / RLS policy / CF·Vercel 头 **禁止** 同会话无授权并行。  
2. **先网络/部署，后开关**：`D-CSP-01` 未解除前 **禁止** 写 Preview/Prod `CSP_*`。  
3. **先 tip 上生产（安全修）再谈 enforce 收紧**：`D-OPS-01` / `D-CSP-03`。  
4. **人 gate 明文**：生产 CSP 须「生产 CSP flip 现在」+ 阶段；RLS 须「RLS flip 现在」+ 范围。  
5. **验收**：每个模块交付须 exit code + 证据路径；禁空口完成。

---

## 1. 模块卡（建议波次序）

### Wave 0 · 解阻与对齐（优先）

| Module ID | 名称 | 债 ID | 范围（做） | 不做 | 验收 | 依赖 | Owner 意图 |
|-----------|------|-------|------------|------|------|------|------------|
| **M-CP-stage-a-net** | Preview 网络解阻 | D-CSP-01 | 换执行机/出口；`curl -sI --max-time 20 $BASE/` 得 HTTP 状态行；记录 DNS/TCP/证书分列；更新 blocker 状态 | 写 `CSP_*`；改生产 | A0 绿 · exit≠28 | — | Platform / 操作人 |
| **M-CP-prod-deploy** | 生产 tip 对齐部署 | D-OPS-01 · D-CSP-03 · D-TEST-01 | 合入 tip（≥ `df11a2f2` 安全/测修）→ **人授** `vercel deploy --prod` → `build-info` commit 对齐 · 探针 home/health/search | CSP env flip；RLS DDL；功能大改 | `build-info.commit` == 目标 shortsha · health 主 checks ok | 合入授权 | Release |
| **M-CP-resource-rpc** | 资源库搜索 RPC | D-HLTH-01 | 查 `resourceLibrarySearch` RPC 缺失/权限；修 migration 或 health 预期；非生产验证 | 生产盲目 DROP；改公开 API 契约无测 | health 该项 ok 或明确 DEFER+原因 | 可选并行 deploy 后 | Backend |

### Wave 1 · Preview CSP 金丝雀（网络绿后）

| Module ID | 名称 | 债 ID | 范围（做） | 不做 | 验收 | 依赖 | Owner 意图 |
|-----------|------|-------|------------|------|------|------|------------|
| **M-CP-stage-a-csp** | Preview Stage A | D-CSP-01 后续 | **仅 Preview** `CSP_DYNAMIC=1` · redeploy · 头含 `nonce-` · HTML nonce · 首页/搜索/admin 冒烟 · S4 csp-report 204 | Production 任何 `CSP_*`；Stage B 抢跑 | canary runbook §2 全绿 · prep §4 | M-CP-stage-a-net | AppSec + App |
| **M-CP-stage-b-csp** | Preview Stage B（可选） | D-CSP-02 前置 | 仅 A 绿后 Preview `CSP_SCRIPT_UNSAFE_INLINE=0` · 功能+RO/Sentry 观察 | 生产 cutover | A+B 绿 · 无不可接受 CSP 红错 | M-CP-stage-a-csp | AppSec |

### Wave 2 · 生产安全门闩（人 gate · 错开 ≥48h）

| Module ID | 名称 | 债 ID | 范围（做） | 不做 | 验收 | 依赖 | Owner 意图 |
|-----------|------|-------|------------|------|------|------|------------|
| **M-CP-csp-prod-gate** | 生产 CSP Prod-A/B | D-CSP-02 | 勾满 w3-csp-prod-gate-dossier P1–P9 · 用户原文授权 · **仅 Prod** 设 DYNAMIC→观察窗→可选去 unsafe-inline | 无 Preview 绿仍 flip；与 TH D7 同日；静默默认改代码 | 卷宗勾选 + 观察窗指标 + 回滚演练记录 | Stage A(+B) · prod tip 对齐 | AppSec · 人 gate |
| **M-CP-rls-rankings** | model_rankings 收紧 | D-RLS-01 | 非生产演练 → 变更单 → DROP public 写 policy · 保留读 · Admin/server 写路径绿 | 与 CSP flip 同会话无授权；无「RLS flip 现在」 | rls-audit：anon 写失败 · 前台读榜成功 | 非生产 runbook | DB + App · 人 gate |
| **M-CP-rls-hygiene** | RLS 次要面 | D-RLS-02 · D-RLS-03 | 收 GRANT / 无 policy 表意图 / revoke 多余 DEFINER EXECUTE | 一次改全库无回滚快照 | inventory 差分报告 | M-CP-rls-rankings 后或并行文档-only | DB |
| **M-CP-headers-platform** | Headers 单源 | D-HDR-01 | 填 change-request · P1 可达后 **一层**（CF 或 Vercel）对齐 XFO/Referrer | 盲改 Next 假装消除 DRIFT | probe:headers --allow-production --compare-repo 无 XFO/Referrer DRIFT | 平台权限 · 建议 Stage 网通 | Platform |

### Wave 3 · 应用纵深与卫生（可与 Wave 0–1 部分并行）

| Module ID | 名称 | 债 ID | 范围（做） | 不做 | 验收 | 依赖 | Owner 意图 |
|-----------|------|-------|------------|------|------|------|------------|
| **M-CP-favorites-jwt** | Favorites DB 纵深 | D-FAV-01 | SECURITY DEFINER RPC 或 Supabase JWT sub 对齐；应用层仍 session 校验 | 客户端传 userId；公开 service_role | IDOR 测 + RPC 测绿 · 注释更新 | 迁移授权 | Backend |
| **M-CP-rate-limit-policy** | 限流策略硬化 | D-RL-01 · D-RL-03 | 扫 call sites 强制显式 policy；删/硬 fail 废弃 `checkClickRateLimit`；补契约测 | 改生产 fail-closed 默认无评估 | vitest 覆盖 · 无 silent allow 默认敏感路径 | — | Backend |
| **M-CP-rate-limit-ops** | 生产限流 ops | D-RL-02 | 确认 Upstash；评估 `DISTRIBUTED_RATE_LIMIT_FAIL_CLOSED=1` 文档+人授 env | 本模块改代码默认 fail-open→closed 无 ADR | health distributed ok · env 决策记录 | 运维授权 | SRE |
| **M-CP-test-hygiene** | 测卫生扩散 | D-TEST-02 | 限流相关测统一 beforeEach 清 Upstash（模式对齐 flaky-search） | 关正式用例 | 宿主有 UPSTASH 时相关测仍绿 | — | QA |
| **M-CP-csp-report-hygiene** | report 日志 residual | D-CSP-04 | 评估 `original-policy` 采样脱敏 | 关 report 通道 | 测锁定不泄用户 query | — | AppSec |
| **M-CP-edge-audit** | 边缘周期审计 | D-EDGE-01 | 跑 `audit-edge-scripts.mjs` · mangled=0 | 关 Rocket Loader 无记录 | 报告入 ops 日期戳 | 周期 | Ops |

### Wave 4 · 规模与边界（触发式 / DEFER）

| Module ID | 名称 | 债 ID | 触发 | 不做（现） |
|-----------|------|-------|------|------------|
| **M-CP-search-scale** | Fuse/列表规模 | D-ARCH-02 | 链接 >2k 或 p95/INP 恶化 | 无指标拆 Meili/虚拟列表 |
| **M-CP-ingest-boundary** | ingest/embed 出请求 | D-ING-01 | H2 B3 启动 | 无 ADR 改写路径 |
| **M-CP-payments** | 真支付 | D-PAY-01 | 产品启用支付 | 现保持 404/501 桩 |

---

## 2. 依赖图（简）

```text
M-CP-stage-a-net ──► M-CP-stage-a-csp ──► M-CP-stage-b-csp ──► M-CP-csp-prod-gate
                              │
M-CP-prod-deploy ─────────────┴── (tip 对齐强烈建议先于 prod CSP)
M-CP-resource-rpc ── (可并行，修 health 红项)

M-CP-rls-rankings ──► M-CP-rls-hygiene     [人 gate · 勿与 csp-prod 无授权同会话]
M-CP-headers-platform                     [平台 · 建议网通后]
M-CP-favorites-jwt / rate-limit-* / test-hygiene  [应用并行]
```

---

## 3. 建议首派（G0 后 3 张最小卡）

| 序 | 模块 | 原因 |
|----|------|------|
| 1 | **M-CP-stage-a-net** | 不解阻则 CSP 金丝雀永久纸上 |
| 2 | **M-CP-prod-deploy** | tip 含 critical 限流/脱敏修，生产仍旧 runtime |
| 3 | **M-CP-rls-rankings**（文档+非生产演练可先） | 唯一明确 public 写高风险表；**flip 仍人 gate** |

并行可选：**M-CP-resource-rpc**（health 红）、**M-CP-rate-limit-policy**（纯代码测、无 flip）。

---

## 4. 模块开工检查单（每卡复制）

```text
[ ] 已读 DEBT 对应 ID + PROJECT.md 栈锁
[ ] 范围 = 做列；不做列已抄进 PR/会话
[ ] 不写 Production CSP_* / 不跑生产 RLS DDL（除非本卡就是人授 flip）
[ ] 验证命令 + exit code 写入交付
[ ] 回执总控：DONE | BLOCKED | 证据路径
[ ] 无 push 除非总控授权
```

---

## 5. 回执模板（模块 → cp-coord）

```text
module: M-CP-…
status: DONE | BLOCKED | IN_PROGRESS
debt: D-…
evidence:
  - command → exit N
  - path/to/doc-or-log
risk_one_liner: …
prod_csp_flip: NOT_EXECUTED | (仅人授卡填写)
rls_flip: NOT_EXECUTED | …
```

---

## 6. Scout 交付状态

| 项 | 状态 |
|----|------|
| DEBT.md | **已写** |
| DISPATCH.md | **已写** |
| 实现开工 | **否**（停） |
| workspace-status | 见会话末 · **in-review** |
| 总控 | 待 `cp-coord` G0 |
