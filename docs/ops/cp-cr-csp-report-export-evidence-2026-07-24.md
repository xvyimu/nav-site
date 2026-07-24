# M-CP-cr-csp-report-export evidence — 2026-07-24

## Problem

`app/api/csp-report/route.ts` exported `toPathOnlyUri` (non-handler). Next 16 App Router route type-check rejects non-handler named exports → `pnpm build` (`next build --webpack`) exit 1 on origin/master (W11 long-verify BLOCKER).

## Fix (minimal)

1. Move pure helper to `lib/csp-report-uri.ts`.
2. `route.ts` only imports and uses it — no re-export.
3. `tests/api-csp-report.test.ts` imports `toPathOnlyUri` from `@/lib/csp-report-uri`.

## Verify

| Command | Exit |
|---------|------|
| `pnpm exec vitest run tests/api-csp-report.test.ts` | **0** (6/6) |
| `pnpm run build` (`next build --webpack`) | **0** |
| `pnpm typecheck` (optional probe) | **2** — pre-existing `tests/probe-security-headers.test.ts` `ProcessEnv` / index errors (W5 `cp-typecheck-probe-headers` scope; not this module) |

## Risk

None beyond normal merge: pure move of sanitize helper; CSP policy, rate-limit, and sampling unchanged.
