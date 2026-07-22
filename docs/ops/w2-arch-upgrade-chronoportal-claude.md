# W2 · ChronoPortal · Claude · arch/stack upgrade

## Worktree identity

| Field | Value |
| --- | --- |
| Start HEAD | `42f98912f7cb19576d7e1c03847d0e7b5e9cf65f` |
| Branch | `xvyimu/w2-cp-claude` |
| Worktree (absolute) | `C:\Users\yuanjia\orca\workspaces\ChronoPortal\w2-cp-claude` |
| Agent | claude (solo) |
| Plan | `D:\orca\.planning\portfolio-arch-upgrade-2026h2` · `prompts/w2-shared.md` + `prompts/w2-cp.md` |
| Date | 2026-07-23 |

## Scope delivered

1. **Preview CSP Stage A**  
   - Vercel CLI 已登录、`nav-site` 可 link、Preview env **可读**、部署列表可见。  
   - 本机对 **`*.vercel.app` TCP 不可达**（connect timeout）；**故意未**写入 Preview `CSP_DYNAMIC=1`。  
   - **环境阻断书** + 本地 DYNAMIC 契约证据：  
     `docs/ops/csp-dynamic-preview-stage-a-blocker-2026-07-23.md`
2. **next-auth 5 beta 决策 ADR**  
   - `docs/adr-007-next-auth-v5-strategy.md`  
   - **决策：风险接受，继续 pin `5.0.0-beta.31`**（npm 无 stable 5.x；`latest=4.24.15`，`beta=5.0.0-beta.32`）。迁移路径有触发条件。
3. **headers DRIFT 平台层处置建议**（W1 已溯源）  
   - `docs/ops/headers-drift-platform-remediation-2026-07.md`  
   - 生产 DRIFT W2 复测仍在；P1 Preview 对比同网络阻断；**未**改 CF/Vercel/Next。
4. **stack-matrix W2 列**  
   - `docs/ops/stack-matrix-2026-07.md` 增补 **W2 已做** 与架构姿态表。

## Verification (commands + exit codes)

| Command | Exit | Notes |
| --- | ---: | --- |
| `pnpm install --frozen-lockfile` | **0** | Fresh worktree |
| `pnpm exec vitest run tests/csp.test.ts tests/api-csp-report.test.ts tests/probe-security-headers.test.ts` | **0** | 3 files / **22** tests |
| `node --experimental-strip-types` · `createDynamicCspAttachment({CSP_DYNAMIC:'1',…})` | **0** | nonce + unsafe-inline (Stage A shape) |
| `pnpm run probe:headers -- --base-url https://yuanjia1314.ccwu.cc --allow-production --compare-repo --json` | **0** | XFO/Referrer **DRIFT** reconfirmed |
| `node scripts/audit-edge-scripts.mjs` | **0** | mangled 0 · rocketLoaderHints false |
| `pnpm run probe:headers -- --base-url https://nav-site-lk16isapm-aijiai520.vercel.app --compare-repo --json` | **1** | `fetch failed` / connect timeout（非 canary 策略拦截） |
| `npm view next-auth dist-tags` | **0** | latest `4.24.15` · beta `5.0.0-beta.32` |
| `vercel whoami` / `vercel project ls --scope aijiai520` | **0** | `nav-site` 可见 |
| Production `CSP_*` env | n/a | **无** CSP_DYNAMIC 等（只读列表） |
| Preview `CSP_*` env | n/a | **无**；本会话 **未 add** |

## Canary Stage A status

| Item | Status |
| --- | --- |
| Runbook | `docs/ops/csp-dynamic-preview-canary-2026-07-22.md` |
| Preflight code/tests/edge | **PASS**（tip ≥ T-CP-001；vitest 绿；edge audit 绿） |
| Preview project access | **PASS**（CLI + `nav-site`） |
| Preview HTTP reachability from agent host | **FAIL** (`*.vercel.app` timeout) |
| Stage A env write + redeploy + §2.3–2.4 | **NOT RUN**（见阻断书） |
| Production CSP | **untouched** |

## Headers DRIFT (W2)

| Header | Repo | Live custom domain | W2 |
| --- | --- | --- | --- |
| X-Frame-Options | DENY | SAMEORIGIN | DRIFT 仍在；平台处置文已写 |
| Referrer-Policy | strict-origin-when-cross-origin | same-origin | 同上 |

Working theory unchanged: **CF and/or Vercel rewrite**, not Next source on `46e71ec`. Next proof remains Preview without CF when network allows.

## Files written (this wave)

| Path | Kind |
| --- | --- |
| `docs/ops/csp-dynamic-preview-stage-a-blocker-2026-07-23.md` | **new** |
| `docs/adr-007-next-auth-v5-strategy.md` | **new** |
| `docs/ops/headers-drift-platform-remediation-2026-07.md` | **new** |
| `docs/ops/stack-matrix-2026-07.md` | **updated** (W2 columns) |
| `docs/ops/headers-drift-trace-2026-07.md` | **updated** (W2 pointer) |
| `docs/ops/w2-arch-upgrade-chronoportal-claude.md` | **this report** |

No application runtime code, production env, or CF console changes.  
`.vercel/` link dir is gitignored (not committed).

## Explicit non-actions (W2 bans)

| Not done | Why |
| --- | --- |
| push / merge default branch | Total-control |
| Production `CSP_DYNAMIC=1` / strip script `'unsafe-inline'` | W3 + human gate |
| Production RLS | W3 + human gate |
| Preview `CSP_DYNAMIC=1` write | Would be unverifiable (network) → blocker instead |
| Blind Next/CF “fix” for DRIFT | Platform proof incomplete |
| next-auth version bump | ADR-007: accept risk on pin |
| asar / ISS / framework swap | Portfolio red lines |
| Full ingest/embedding boundary design | Not in `prompts/w2-cp.md` acceptance list |

## DEFER / owners

| Item | Owner | Wave |
| --- | --- | --- |
| Restore agent/CI path to `*.vercel.app` then Stage A | Platform + app op | ASAP / W2 residual |
| CF vs Vercel layer proof (P1–P3) | Platform op | After Preview reachable |
| Production CSP / RLS flip | Human gate | W3 |
| next-auth bump when stable 5.x or security trigger | App owner | W3–W4 |
| Ingest out of request path design | App arch | W2.1 / W3 |
| Merge this branch | Total-control | — |

## Acceptance vs `w2-cp.md`

| Criterion | Status |
| --- | --- |
| canary 证据 **或** 阻断书 | **Met**（阻断书 + 本地 CSP DYNAMIC 证据） |
| next-auth ADR | **Met**（ADR-007） |
| headers 平台处置建议 | **Met** |
| 相关 vitest 仍绿 | **Met**（22 tests exit 0） |
| No prod CSP/RLS / no push | **Met** |

## Stop

W2 Claude cut complete in this worktree. Docs-only dirty tree until optional local commit. **No push.**
