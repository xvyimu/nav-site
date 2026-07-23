# ChronoPortal · Preview Stage A 可执行预备 · 2026-07-24

> **Worktree / 分支：** `xvyimu/cp-preview-prep`  
> **base tip：** `68dd13dd`（`fix(security): add Retry-After on csp-report rate-limit 204`）  
> **红线：** **未 push** · **生产 CSP 未 flip** · `CP_CSP_prod` 仍人 gate · 不写真实密钥进 git · 不写 Preview/Production `CSP_*` env

---

## 0. 一句话

| 项 | 结果 |
|----|------|
| tip 安全修 + audit 门 | **在** `e028483e`…`68dd13dd`（限流参数序 + Retry-After + audit-high 契约） |
| Stage A 预备文档 | **本文件**（env 名 · 探针 · 阻断 · 与生产边界） |
| 本机 Preview E2E smoke | **BLOCKED** · `*.vercel.app` connect timeout（exit 28 / probe exit 1） |
| Preview `CSP_DYNAMIC=1` 写入 | **未写**（故意：不可验证） |
| 生产任何 `CSP_*` | **未写** · **本任务未 flip 生产 CSP** |
| push | **未做** |

**交给操作人：** 网络恢复后按 §4 最短路径 + canary runbook 执行 Stage A；本会话只交付可复制清单与阻断证据。

---

## 1. P0 继承（tip 确认）

| 源 | 状态 |
|----|------|
| `docs/ops/cp-day-sec-surface-2026-07-24.md` | 已读 · 全日安全面 + CI 巩固 |
| `docs/ops/cp-ci-audit-and-preview-prep-2026-07-23.md` | 已读 · Stage A 核对表 §2.3.1 |
| `docs/ops/csp-dynamic-preview-stage-a-blocker-2026-07-23.md` | 已读 · **阻断仍有效** |
| Runbook | `docs/ops/csp-dynamic-preview-canary-2026-07-22.md` |
| 生产卷宗 | `docs/ops/w3-csp-prod-gate-dossier.md` · **PROD FLIP NOT EXECUTED** |

### 1.1 tip 上的安全/CI 提交（本 base）

| commit | 摘要 |
|--------|------|
| `e028483e` | CI `pnpm audit --registry=https://registry.npmjs.org --audit-level=high` |
| `b4865cbb` | 契约测锁定 audit 门（禁 `continue-on-error` / 禁降级 critical） |
| `adb8d306` | `csp-report` 限流参数序 `(key, windowMs=60_000, max=60)` |
| `68dd13dd` | 限流拒绝仍 204，附 `Retry-After: 60` |

本地契约（本 wt · 2026-07-24）：

```text
pnpm exec vitest run tests/csp.test.ts tests/api-csp-report.test.ts tests/ci-workflow.test.ts
→ 3 files / 22 tests · exit 0
```

---

## 2. Preview URL 形态

| 项 | 值 / 规则 |
|----|-----------|
| Vercel project | `nav-site` · scope `aijiai520`（历史阻断书；CLI `vercel whoami` → `xiej4352-5525`） |
| Preview URL 形态 | `https://<deployment-slug>-aijiai520.vercel.app` 或 `https://nav-site-*-aijiai520.vercel.app` |
| 历史例（**可能已过期**） | `https://nav-site-lk16isapm-aijiai520.vercel.app` |
| **禁止 `$BASE`** | `https://yuanjia1314.ccwu.cc`（生产自定义域） |
| 生产对照（只读） | `GET /build-info.json` — 本会话见 commit `46e71ec…`（**落后** tip；非本任务部署） |

**守卫（PowerShell）：**

```powershell
$PROD = "https://yuanjia1314.ccwu.cc"
$BASE = "https://<preview-deployment>.vercel.app"  # 必填真实 Preview
if ($BASE -eq $PROD) { throw "Refusing production base." }
if ($BASE -notmatch '\.vercel\.app$') { throw "BASE must be *.vercel.app for Stage A." }
```

---

## 3. Env 名 SSOT（**仅名；本会话未写任何环境**）

代码读取：`lib/csp.ts` → `readCspFlags`  
模板注释：`.env.local.example` CSP / T9 段

| 变量 | 默认（代码） | Preview Stage A | Preview Stage B | Production（本预备 **禁止**） |
|------|--------------|-----------------|-----------------|------------------------------|
| `CSP_DYNAMIC` | **off** (`false`) | **`1`** | `1` | **不写** |
| `CSP_SCRIPT_UNSAFE_INLINE` | **on** (`true`) | 保持默认 on / 不设 | 可试 **`0`** | **不写** |
| `CSP_REPORT_ONLY` | **on** (`true`) | 默认可留 | 默认可留 | **不写** |

**解析约定（`parseBool`）：** `1|true|yes|on` → true；`0|false|no|off` → false；空/未设 → 上表默认。

**CLI 形态（操作人 · 网络恢复后 · 仅 preview）：**

```text
# Dashboard：Environment Variables → 目标仅勾 Preview → CSP_DYNAMIC = 1
# 或 CLI（按当前 vercel 语法；勿勾 Production）：
#   vercel env add CSP_DYNAMIC preview
#   值：1
```

**禁止：** 把 Preview 专用值提交进 git；把 `CSP_*` 写到 Production；本预备授权任何 Production env 变更。

---

## 4. Stage A 最短路径（操作人 · 网络通后）

权威细节：canary runbook §2 + prep §2.3.1。摘要：

| 步 | 动作 | 验收 | 回滚 |
|----|------|------|------|
| A0 | 执行机 `curl -sI --max-time 20 https://<preview>.vercel.app/` | 有 HTTP 状态行（非 timeout / exit 28） | **不通则停止，不写 env** |
| A1 | **仅 Preview** 设 `CSP_DYNAMIC=1` | env 列表 Preview 可见；Production **无**该项 | 删 Preview 变量 |
| A2 | Redeploy 该 Preview | `/build-info.json` commit 与目标 tip 一致 | Redeploy 旧 deployment |
| A3 | `$BASE` 守卫 ≠ 生产域 | 脚本 throw 若等于生产 | — |
| A4 | 头：`Content-Security-Policy` 含 `nonce-`；阶段 A 可含 `'unsafe-inline'` | `curl -sI` / `probe:headers` | R1：关 `CSP_DYNAMIC` |
| A5 | HTML script 带匹配 `nonce=` | `curl -s` 含 `nonce=` | 同 R1 |
| A6 | 功能冒烟（首页 / 搜索 / admin 登录） | 无 enforcing CSP block 红错 | 同 R1 |
| A7 | （可选）Stage B 仅 Preview `CSP_SCRIPT_UNSAFE_INLINE=0` | **A 全绿后** | R2：恢复 unsafe-inline |

失败只做 **Preview** R1/R2（见 canary §4）；**不要**改 Production。

---

## 5. 探针命令块（复制用）

### 5.1 连通 + 头 + 仓库对照

```powershell
$PROD = "https://yuanjia1314.ccwu.cc"
$BASE = "https://<preview-deployment>.vercel.app"
if ($BASE -eq $PROD) { throw "Refusing production base." }

# A0 连通 + CSP 头
curl.exe -sI --max-time 20 "$BASE/" | findstr /I "HTTP content-security-policy x-nonce"
if ($LASTEXITCODE -ne 0) { throw "Preview unreachable or headers missing." }

# HTML nonce
curl.exe -s --max-time 30 "$BASE/" | findstr /I "nonce="

# 仓库头探针
pnpm run probe:headers -- --base-url $BASE --compare-repo --json

# 对照：生产可达 ≠ Preview 通
curl.exe -sS --max-time 15 "$PROD/build-info.json"
```

### 5.2 最小 smoke 清单（网络通后记 exit）

| # | 探针 | 命令 | 期望 |
|---|------|------|------|
| S1 | health | `curl.exe -sS --max-time 20 "$BASE/api/health"` | 2xx JSON；checks 不因 CSP 变 error |
| S2 | 首页 | `curl.exe -sI --max-time 20 "$BASE/"` | 2xx；CSP 含 `nonce-`（Stage A 开 DYNAMIC 后） |
| S3 | admin 登录页 | `curl.exe -sI --max-time 20 "$BASE/login"` | 2xx（或预期重定向）；无 5xx |
| S4 | csp-report 204 | 见下块 | **204**（空/无效体亦 204；限流仍 204 + `Retry-After`） |

```powershell
# S4 csp-report sink（公开 POST；勿刷爆）
curl.exe -sS -o NUL -w "http_code=%{http_code}`n" --max-time 20 `
  -X POST "$BASE/api/csp-report" `
  -H "Content-Type: application/csp-report" `
  -d '{"csp-report":{"violated-directive":"script-src","blocked-uri":"https://example.invalid/x","document-uri":"https://example.invalid/"}}'
# 期望：http_code=204
```

可选：

```powershell
pnpm run verify:production -- --base-url $BASE --expect-commit <preview-sha>
# 或：node scripts/probe-production.mjs --no-proxy --base-url $BASE
node scripts/audit-edge-scripts.mjs   # 生产 host 只读；≠ Stage A 本身
```

### 5.3 本地替代证据（**不能**代替 Preview E2E）

| 检查 | 命令 / 本会话结果 | Exit |
|------|-------------------|------|
| CSP + report + audit 契约 | `pnpm exec vitest run tests/csp.test.ts tests/api-csp-report.test.ts tests/ci-workflow.test.ts` → 22 tests | **0** |
| 动态 attachment 形状 | `createDynamicCspAttachment({CSP_DYNAMIC:'1',…}, {nonce:'…'})` → `dynamic:true`；enforcing 含 `'nonce-…'` + Stage-A `'unsafe-inline'`；RO 含 `report-uri /api/csp-report` | **0** |

---

## 6. P2 本机探针结果（2026-07-24 · **BLOCKED**）

### 6.1 结论

**Stage A E2E 未执行。** 本机到 `*.vercel.app` **TCP 连通失败**；与 W2/W3/DAY 阻断书同因。  
**故意不**写 Preview `CSP_DYNAMIC=1`（无法完成头/功能冒烟与失败回滚验证）。

### 6.2 实测

| 目标 | 结果 | Exit / 码 |
|------|------|-----------|
| `https://nav-site-lk16isapm-aijiai520.vercel.app/` HEAD | **Connection timed out**（~15s） | curl **28** · `http_code=000` |
| `pnpm run probe:headers -- --base-url <preview> --compare-repo --json` | `ok:false`, `reason:"fetch failed"` | **1**（网络，非 canary block） |
| `https://yuanjia1314.ccwu.cc/build-info.json` | **200** JSON · commit `46e71ec38e3828b892058f7e059f88478807434b` | **0** |
| `vercel whoami` | `xiej4352-5525`（CLI 登录有） | — |
| `.vercel/` link in this wt | **无**（`Test-Path .vercel` → False） | — |

> 注：`vercel.com` HEAD 本机会话曾报 `CRYPT_E_REVOCATION_OFFLINE`（证书吊销离线检查），与 Preview 边缘 **timeout** 分列；生产自定义域仍通 → 阻断面仍是 **Preview 边缘路径**，不是「完全无网」。

### 6.3 复现命令（给下一执行机）

```powershell
$BASE = "https://nav-site-lk16isapm-aijiai520.vercel.app"  # 或 vercel ls 最新 Preview
curl.exe -sI --max-time 20 -w "http_code=%{http_code} err=%{errormsg}`n" "$BASE/"
# BLOCKED 形态：http_code=000 · timed out · exit 28

pnpm run probe:headers -- --base-url $BASE --compare-repo --json
# BLOCKED 形态：ok:false reason:fetch failed · exit 1

# 对照
curl.exe -sS --max-time 15 "https://yuanjia1314.ccwu.cc/build-info.json"
# 期望通：200 + commit 字段
```

### 6.4 网络阻断时如何记录

| 字段 | 填法 |
|------|------|
| 日期 / 执行机 | 本机 hostname + 时区 |
| DNS | 是否解析到 Vercel anycast（历史：114dns → `107.181.166.244` / IPv6） |
| TCP | `curl -v` / `--resolve` 到解析 IP 与 `76.76.21.21` 的 timeout vs reset |
| 证书 | 若为 schannel/吊销错误单独记，勿与 connect timeout 混为一谈 |
| 控制面 | `vercel whoami` / `vercel env ls preview`（**可读 ≠ 可 E2E**） |
| 生产对照 | `yuanjia1314.ccwu.cc` 是否 200 |
| 决策 | **不通 → 不写 env**；记 **BLOCKED** + 上表 exit |

---

## 7. Stage A 做/不做 · 与生产 CSP 边界

| 动作 | Stage A（Preview） | 本会话 | 生产 |
|------|--------------------|--------|------|
| 读 env / 部署列表 | 可 | CLI whoami 有；本 wt 未 link | 只读可 |
| 写 `CSP_DYNAMIC=1` | 网络通后 **可** | **未写** | **禁止** |
| 写 `CSP_SCRIPT_UNSAFE_INLINE=0` | 仅 Stage B 且 A 全绿 | **未写** | **禁止** |
| 改 `CSP_REPORT_ONLY` | 通常不改 | **未写** | **禁止** |
| 改 `next.config` / `proxy` 默认 flag | 否（runbook 范围外） | **未改** | **未改** |
| 功能冒烟 A1–A6 | 是 | **BLOCKED** | 不在本预备执行 |
| 宣称 cutover / 合默认分支 | 否 | **否** | **否** |
| `CP_CSP_prod` portfolio gate | n/a | **DEFER · 人 gate** | **未 flip** |

### 7.1 生产 enforce 前置（摘自卷宗 · **全部未勾选执行**）

必须为真再请求生产 flip（**本任务不授权**）：

1. tip ≥ T9″ nonce 路径已在 **将部署的** 生产 commit  
2. **Preview Stage A 全绿**（本文件 §4–5）  
3. Preview Stage B 强烈建议通过  
4. 边缘 mangled=0 · Rocket Loader off  
5. CSP 单测绿 · csp-report 可观测  
6. 回滚负责人 + 观察窗书面确认  
7. 用户原文授权：「生产 CSP flip 现在」+ 阶段  

### 7.2 与 TH D7 / 观察窗

- 生产 Prod-A 与 TH **D7 勿同日撞车**；至少错开 **≥48h** 观察（卷宗 `w3-csp-prod-gate-dossier.md` §2.2）。  
- Preview Stage A **本身**不启动生产 48h 窗；但 **无 Preview 绿则禁止讨论生产**。

### 7.3 明文

> **本任务（cp-preview-prep · 2026-07-24）未 flip 生产 CSP。**  
> 未写入任何 Production `CSP_*`；未将代码默认改为生产 enforcing 终态；`CP_CSP_prod` 仍 DEFER。

---

## 8. 完成定义对照

| 定义 | 状态 |
|------|------|
| Stage A 预备可交给人执行（env 名 · 探针 · 阻断 · 边界） | **是**（本文） |
| tip 含 csp-report 限流修 + audit 门 | **是** |
| 无 CSP 生产变更 | **是** |
| 未 push | **是**（commit 若有则仅 local） |

---

## 9. 交叉引用

| 资源 | 路径 |
|------|------|
| DAY 安全面 | `docs/ops/cp-day-sec-surface-2026-07-24.md` |
| CI audit + 昨日预备 | `docs/ops/cp-ci-audit-and-preview-prep-2026-07-23.md` |
| Stage A 阻断书 | `docs/ops/csp-dynamic-preview-stage-a-blocker-2026-07-23.md` |
| Canary runbook | `docs/ops/csp-dynamic-preview-canary-2026-07-22.md` |
| 生产 CSP 卷宗 | `docs/ops/w3-csp-prod-gate-dossier.md` |
| T9 决策 | `docs/csp-t9-decision-2026-07-22.md` |
| Env 模板 | `.env.local.example`（CSP 段） |
| Flags / builders | `lib/csp.ts` |
| Report sink | `app/api/csp-report/route.ts` |
| 头探针 | `scripts/probe-security-headers.mjs` · `pnpm run probe:headers` |
| 形态栈 | `docs/PROJECT.md` · 安全 `SECURITY.md` |
