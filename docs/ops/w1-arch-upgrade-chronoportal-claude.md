# W1 · ChronoPortal · Claude · arch/stack upgrade

## Worktree identity

| Field | Value |
| --- | --- |
| Start HEAD | `38d296acb1c9f7f253a484761d1336c840cd89a4` |
| End HEAD (pre-commit if any) | same tip unless local commit added below |
| Branch | `xvyimu/w1-cp-claude` |
| Worktree (absolute) | `C:\Users\yuanjia\orca\workspaces\ChronoPortal\w1-cp-claude` |
| Agent | claude (solo) |
| Plan | `D:\orca\.planning\portfolio-arch-upgrade-2026h2` · prompts `w1-shared.md` + `w1-cp.md` |
| Date | 2026-07-23 |

## Scope delivered

1. **stack-matrix** → `docs/ops/stack-matrix-2026-07.md`  
   Next 16.2.9 / React 19.2.4 / TW4 / Supabase pins / next-auth beta / Sentry 10 / pnpm 11.5 / CI Node 22; audit snapshot; W1 vs later waves.
2. **headers DRIFT trace (read-only)** → `docs/ops/headers-drift-trace-2026-07.md`  
   Re-ran `probe:headers` with production allow + compare-repo; confirmed XFO/Referrer DRIFT; production still on `46e71ec`; local BASE unreached (no dev server).
3. **Preview CSP canary preflight** against `docs/ops/csp-dynamic-preview-canary-2026-07-22.md` §1 / §5.1 (checklist below). **No stage A deploy** this session (no linked `.vercel` project / no Preview env mutation authorized).
4. **CSP unit tests green** (`tests/csp.test.ts` + related report route tests).

## Verification (commands + exit codes)

| Command | Exit | Notes |
| --- | ---: | --- |
| `pnpm install --frozen-lockfile` | 0 | Fresh worktree install |
| `pnpm exec vitest run tests/csp.test.ts` | **0** | 1 file / **12** tests |
| `pnpm exec vitest run tests/api-csp-report.test.ts` | **0** | 1 file / **4** tests |
| `pnpm exec vitest run tests/probe-security-headers.test.ts` | **0** | 1 file / **6** tests |
| `node scripts/probe-security-headers.mjs --base-url https://yuanjia1314.ccwu.cc --json` | **1** | Canary block (by design) |
| `pnpm run probe:headers -- --base-url https://yuanjia1314.ccwu.cc --allow-production --compare-repo --json` | **0** | HTTP 200; XFO/Referrer DRIFT rows |
| `pnpm run probe:headers -- --base-url http://127.0.0.1:3264 --compare-repo --json` | **1** | fetch failed — local server not up |
| `node scripts/audit-edge-scripts.mjs` | **0** | `mangledScriptTypeCount=0`, `rocketLoaderHints=false` |
| `pnpm audit --registry=https://registry.npmjs.org --audit-level moderate` | **1** | 3 high + 1 moderate recorded in stack-matrix (no lock churn) |

## Canary preflight checklist (runbook §5.1)

| # | Condition | W1 result |
| --- | --- | --- |
| 1 | tip ≥ T-CP-001 / `getCspNonce` (`≥ 80e12388`) | **PASS** — HEAD `38d296ac` includes that lineage |
| 2 | `tests/csp.test.ts` green | **PASS** exit 0 |
| 3 | Edge: mangled type 0 · Rocket Loader off | **PASS** exit 0 |
| 4 | Preview deployable (`nav-site` / project bound) | **BLOCKED this agent** — no `.vercel/project.json` in worktree; no Preview env write authorized |
| 5 | Env target is Preview only | **N/A** — stage A not started |
| 6 | `$BASE` ≠ production domain | **N/A** — stage A not started |

**Stage A:** not executed. **Repro blocker:** operator must attach Vercel scope, set **Preview-only** `CSP_DYNAMIC=1`, redeploy Preview, then run runbook §2.3–2.4 against `*.vercel.app` (never production). Production remains default: DYNAMIC off, script unsafe-inline on.

## Headers DRIFT summary

| Header | Repo | Live custom domain | Verdict |
| --- | --- | --- | --- |
| X-Frame-Options | DENY | SAMEORIGIN | DRIFT |
| Referrer-Policy | strict-origin-when-cross-origin | same-origin | DRIFT |
| X-Content-Type-Options | nosniff | nosniff | OK |
| Permissions-Policy | deny cam/mic/geo | match | OK |

Working theory: **Cloudflare and/or Vercel project headers**, not Next source on deploy `46e71ec`. Next proof: Preview hostname without CF (see drift note H1/H2).

## Files written (this wave)

- `docs/ops/stack-matrix-2026-07.md` **(new)**
- `docs/ops/headers-drift-trace-2026-07.md` **(new)**
- `docs/ops/w1-arch-upgrade-chronoportal-claude.md` **(this report)**

No application code, env, or production control-plane changes.

## Explicit non-actions (W1 bans)

| Not done | Why |
| --- | --- |
| push / merge default branch | Total-control |
| Production `CSP_DYNAMIC=1` / strip script `'unsafe-inline'` | W3 + human gate |
| Production RLS | W3 + human gate |
| Blind `next.config` / `proxy` edit to “fix” DRIFT | Forbidden until platform layer proven |
| Stage A Preview env mutation | No authorized Preview project link this session |
| next-auth stable cutover / Sentry major bump | W2+ |
| asar / ISS / framework swap | Portfolio red lines |

## DEFER / owners

| Item | Owner | Wave |
| --- | --- | --- |
| Confirm CF vs Vercel as XFO/Referrer rewriter | App + platform operator | W2 |
| Preview CSP stage A + optional B | Authorized Preview operator | W2 (prep complete W1) |
| Production CSP / RLS flip | Human gate | W3 |
| next-auth ADR (stay beta vs stable vs alternative) | App owner | W2 |
| Transitive audit (Sentry webpack / shadcn hono) | Dependabot-style PR + regression | W2 |
| Merge this branch | Total-control | — |

## Acceptance vs `w1-cp.md`

| Criterion | Status |
| --- | --- |
| stack-matrix on disk | **Met** |
| headers DRIFT note + probe evidence | **Met** |
| CSP tests green | **Met** |
| canary preflight complete **or** reproducible blocker | **Met** (blocker: no Preview project link / no stage A env write) |
| No prod CSP/RLS / no push | **Met** |

## Stop

W1 Claude cut complete in this worktree. Dirty docs only until optional local commit. No push.
