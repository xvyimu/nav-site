# ChronoPortal · stack matrix · 2026-07

> W1 baseline + **W2 updates**. No production flip. Sources: `package.json` lock (pnpm 11.5.0), CI workflows, portfolio card `repos/cp.md`.

## Identity

| Field | Value |
| --- | --- |
| Captured at | 2026-07-23 (W1) · **W2 refresh same calendar day** |
| Branch (W2) | `xvyimu/w2-cp-claude` |
| HEAD (W2 worktree tip) | `42f98912f7cb19576d7e1c03847d0e7b5e9cf65f` (+ local docs commits if any) |
| Worktree | `C:\Users\yuanjia\orca\workspaces\ChronoPortal\w2-cp-claude` |
| Production `/build-info.json` | commit `46e71ec38e3828b892058f7e059f88478807434b` (behind tip; read-only rechecked W2) |
| packageManager | `pnpm@11.5.0` |
| Local Node (agent host) | `v24.16.0` (CI pins **22** — see engines row) |

## Matrix

| Item | Current (repo) | Target (H2) | W1 status | **W2 已做** |
| --- | --- | --- | --- | --- |
| **Next.js** | `16.2.9` (pin) | Patch line only; no major framework swap | Documented; no bump | No bump (correct) |
| **React / react-dom** | `19.2.4` (pin) | Patch line | Documented | No bump |
| **eslint-config-next** | `16.2.9` | Track Next pin | Aligned | — |
| **Tailwind CSS** | `^4` → resolved `4.3.1` (+ `@tailwindcss/postcss`) | Stay on TW4 line | Documented | — |
| **@supabase/ssr** | `0.12.0` (pin) | Follow security line | Documented; no policy flip | No RLS/prod flip |
| **@supabase/supabase-js** | `2.108.2` (pin) | Follow security line | Documented | — |
| **next-auth** | `5.0.0-beta.31` | Stable **or** written risk + path | Risk noted only | **ADR-007：风险接受 pin beta.31**；npm 无 stable 5.x（latest=4.24.15 · beta=5.0.0-beta.32） |
| **@sentry/nextjs** | `^10.59.0` | W2–W3: CSP report linkage | Present; audit note | No major bump；CSP report 路径维持 |
| **TypeScript** | `^5.1.0` → `5.1.3` | Maintain | OK | — |
| **Vitest** | `^4.1.9` | Maintain | CSP + probe green W1 | **W2 re-run 22 tests exit 0** |
| **Playwright** | `^1.61.0` | Maintain | Not full e2e W1 | Not full e2e W2 |
| **Node (CI)** | `22` in workflows | 22 LTS CI | Documented | — |
| **pnpm** | `11.5.0` | 11.5 | Aligned | — |

## Dependency audit (W1 evidence)

Command: `pnpm audit --registry=https://registry.npmjs.org --audit-level moderate`

| Result | Detail |
| --- | --- |
| Exit | **1** (findings above threshold) |
| Counts | 3 high · 1 moderate · 0 critical (metadata totalDependencies ~977) |
| High (sample) | `fast-uri` via `@sentry/nextjs` → webpack-plugin → schema-utils/ajv path (GHSA-4c8g-83qw-93j6) |
| Moderate | `@hono/node-server` via `shadcn` → MCP SDK (GHSA-frvp-7c67-39w9) — **dev tooling**, not runtime edge |

**W1 action:** record only. No lockfile churn / major Sentry bump without a dedicated PR and regression gate (W2).

## Architecture posture

| Concern | Repo state | W1 | **W2** | Later |
| --- | --- | --- | --- | --- |
| Security headers single source | `next.config.ts` contract; live custom domain **DRIFTs** XFO/Referrer | Trace note | **平台层处置建议** `headers-drift-platform-remediation-2026-07.md`；P1 Preview 因 `*.vercel.app` 网络超时未闭环 | 操作人 P1–P3 后人 gate 改一层 |
| CSP static + Report-Only | defaults; `CSP_DYNAMIC` off | Preflight | **Stage A 阻断书** + 本地 DYNAMIC attachment 证据；**未**写 Preview/Prod env | Preview Stage A when network OK · prod W3 + human gate |
| RLS | Non-prod audit docs | — | 不碰 | Prod matrix W3 + human gate |
| Ingest / embedding boundary | scripts + API still coupled paths | — | **本 W2 题单未强制交付设计**（repos/cp 原 W2 含 ingest；prompts/w2-cp 聚焦 canary+auth+headers） | 可排 W2.1 / W3 |
| next-auth | beta.31 pin | Risk note | **ADR-007 决策完成** | Stable 5.x 出现或安全公告时再 bump |

## Explicit non-goals (W1–W2)

- Production `CSP_DYNAMIC` / strip `unsafe-inline`
- Production RLS policy changes
- Blind `next.config` edits to “fix” live DRIFT
- next-auth major/stable cutover **without** trigger conditions in ADR-007
- Framework swap (React/Vue) or monorepo merge
- push / merge default branch (total-control)

## Related

- `docs/ops/headers-drift-trace-2026-07.md`
- `docs/ops/headers-drift-platform-remediation-2026-07.md`
- `docs/ops/csp-dynamic-preview-canary-2026-07-22.md`
- `docs/ops/csp-dynamic-preview-stage-a-blocker-2026-07-23.md`
- `docs/adr-007-next-auth-v5-strategy.md`
- `docs/ops/w1-arch-upgrade-chronoportal-claude.md`
- `docs/ops/w2-arch-upgrade-chronoportal-claude.md`
- Portfolio: `D:\orca\.planning\portfolio-arch-upgrade-2026h2\repos\cp.md`
