# ChronoPortal L2 · P0 hygiene action board · 2026-07-22

Derived from `docs/ops/L2-hygiene-checklist.md`. **Maintain Next; no Vue/Go rewrite.**

## P0 (do before relaxing CSP)

| ID | Item | Status note |
|----|------|-------------|
| P0-CSP-unsafe | Keep `CSP_SCRIPT_UNSAFE_INLINE` default **true** until nonce→layout wired | Code red-line in checklist |
| P0-CSP-dynamic | T9″ 接线已合入（proxy+layout）；**仍勿生产开** `CSP_DYNAMIC=1`，仅 preview 手动验证 | See T9 decision |
| P0-RLS | Run `scripts/rls-audit.sql` on staging/prod with service role carefully | Operator |
| P0-Admin | Confirm admin password hash + session path after deploy | `PRODUCTION-RUNBOOK` |
| P0-Edge | `node scripts/audit-edge-scripts.mjs` → mangled=0, rocketLoader off | Already cleaned 2026-07-22 |

## Commands (local / CI)

```bash
pnpm exec vitest run tests/csp.test.ts tests/api-csp-report.test.ts
node scripts/audit-edge-scripts.mjs
pnpm audit --audit-level=high
```

## P1

| ID | Item |
|----|------|
| P1-T9 | Full nonce cutover on preview canary |
| P1-Sentry-CSP | Watch `source:csp-report` 1–2 days after RO tighten |

## Explicit non-actions

- Flagship monorepo rewrite  
- Enabling strict script CSP without nonce path  

**Status**: Board only; no production env flips this commit.
