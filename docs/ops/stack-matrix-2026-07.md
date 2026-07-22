# ChronoPortal · stack matrix · 2026-07

> W1 baseline card. No production flip. Sources: `package.json` lock (pnpm 11.5.0), CI workflows, portfolio card `repos/cp.md`.

## Identity

| Field | Value |
| --- | --- |
| Captured at | 2026-07-23 |
| Branch | `xvyimu/w1-cp-claude` |
| HEAD (worktree tip) | `38d296acb1c9f7f253a484761d1336c840cd89a4` |
| Worktree | `C:\Users\yuanjia\orca\workspaces\ChronoPortal\w1-cp-claude` |
| Production `/build-info.json` | commit `46e71ec38e3828b892058f7e059f88478807434b` (behind tip; read-only) |
| packageManager | `pnpm@11.5.0` |
| Local Node (agent host) | `v24.16.0` (CI pins **22** — see engines row) |

## Matrix

| Item | Current (repo) | Target (H2) | W1 status |
| --- | --- | --- | --- |
| **Next.js** | `16.2.9` (pin) | Patch line only; no major framework swap | Documented; no bump this wave |
| **React / react-dom** | `19.2.4` (pin) | Patch line | Documented |
| **eslint-config-next** | `16.2.9` | Track Next pin | Aligned |
| **Tailwind CSS** | `^4` → resolved `4.3.1` (+ `@tailwindcss/postcss`) | Stay on TW4 line | Documented |
| **@supabase/ssr** | `0.12.0` (pin) | Follow security line | Documented; no policy flip |
| **@supabase/supabase-js** | `2.108.2` (pin) | Follow security line | Documented |
| **next-auth** | `5.0.0-beta.31` | W2 decision: stable release **or** written risk + alternative ADR | **Risk noted only** (beta in prod path) |
| **@sentry/nextjs** | `^10.59.0` | W2–W3: CSP report linkage | Present; audit transitive note below |
| **TypeScript** | `^5.1.0` → `5.1.3` | Maintain | OK |
| **Vitest** | `^4.1.9` | Maintain | CSP + probe tests green W1 |
| **Playwright** | `^1.61.0` | Maintain | Not re-run full e2e this wave |
| **Node (CI)** | `22` in `.github/workflows/{ci,lighthouse,link-check,production-smoke}.yml` | 22 LTS CI (crosscut) | **Documented**; no engines field in package.json yet |
| **pnpm** | `11.5.0` (packageManager) | 11.5 (portfolio target) | Already aligned |

## Dependency audit (W1 evidence)

Command: `pnpm audit --registry=https://registry.npmjs.org --audit-level moderate`

| Result | Detail |
| --- | --- |
| Exit | **1** (findings above threshold) |
| Counts | 3 high · 1 moderate · 0 critical (metadata totalDependencies ~977) |
| High (sample) | `fast-uri` via `@sentry/nextjs` → webpack-plugin → schema-utils/ajv path (GHSA-4c8g-83qw-93j6) |
| Moderate | `@hono/node-server` via `shadcn` → MCP SDK (GHSA-frvp-7c67-39w9) — **dev tooling**, not runtime edge |

**W1 action:** record only. No lockfile churn / major Sentry bump without a dedicated PR and regression gate (W2).

## Architecture posture (pointers, not W1 implementation)

| Concern | Repo state | Wave |
| --- | --- | --- |
| Security headers single source | `next.config.ts` `securityHeaders`; live custom domain **DRIFTs** XFO/Referrer | Trace W1 · fix after platform proof W2 |
| CSP static + Report-Only | `lib/csp.ts` defaults; `CSP_DYNAMIC` off | Preview canary W1 prep · prod W3 + human gate |
| RLS | Non-prod audit docs exist | Prod matrix W3 + human gate |
| Ingest / embedding path boundary | Out of W1 scope | W2 design |

## Explicit non-goals (W1)

- Production `CSP_DYNAMIC` / strip `unsafe-inline`
- Production RLS policy changes
- Blind `next.config` edits to “fix” live DRIFT
- next-auth major/stable cutover
- Framework swap (React/Vue) or monorepo merge

## Related

- `docs/ops/headers-drift-trace-2026-07.md`
- `docs/ops/w1-arch-upgrade-chronoportal-claude.md`
- `docs/ops/csp-dynamic-preview-canary-2026-07-22.md`
- Portfolio: `D:\orca\.planning\portfolio-arch-upgrade-2026h2\repos\cp.md`
