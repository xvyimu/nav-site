# Security headers matrix (wave7 · companion to AS-IS/TARGET)

> Compact view of `security-headers-as-is-target-2026-07-22.md`.  
> **No production env flip.** Owner actions stay deferred unless you authorize.

## Matrix

| Control | Repo AS-IS | Live observation (2026-07-22) | Target | Owner |
| --- | --- | --- | --- | --- |
| `X-Frame-Options` | `DENY` in `next.config.ts` | Custom domain returned `SAMEORIGIN` | Trace drift on Preview/staging before code change | App + platform |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Live `same-origin` | Same — verify edge/platform override | App + platform |
| `X-Content-Type-Options` | `nosniff` | Matches | Retain | App |
| `Permissions-Policy` | cam/mic/geo denied | Matches | Retain | App |
| HSTS | long max-age + preload | HTTPS domain | Retain | Domain op |
| CSP enforce | static; `script-src` has `'unsafe-inline'` | Matches defaults | **Do not** strip unsafe-inline in prod until Preview canary + monitoring | Security + prod op |
| CSP Report-Only | on by default | Reports to `/api/csp-report` | Keep during migration | Security + observability |
| `CSP_DYNAMIC` nonce | off (`0`) | n/a | Preview canary only — see `csp-dynamic-preview-canary-2026-07-22.md` | Authorized prod op |
| Extra live headers (`expect-ct`, `X-XSS-Protection`) | not in repo array | observed | Treat as platform until verified | Platform |

## Safe local commands

```bash
pnpm exec vitest run tests/csp.test.ts tests/api-csp-report.test.ts
node scripts/audit-edge-scripts.mjs
# Read-only header dump (default BASE=http://127.0.0.1:3264; production host blocked unless --allow-production)
pnpm run probe:headers -- --compare-repo
# Explicit production observation only:
# pnpm run probe:headers -- --base-url https://yuanjia1314.ccwu.cc --allow-production --compare-repo
```

## DEFER (unchanged)

- Production `CSP_DYNAMIC=1` / `CSP_SCRIPT_UNSAFE_INLINE=0`
- Production RLS policy edits
- Cloudflare/Vercel console flips without owner

## Related

- `docs/ops/security-headers-as-is-target-2026-07-22.md` — full narrative + evidence
- `docs/ops/deploy-topology-2026-07-22.md`
- `docs/ops/L2-P0-action-board-2026-07-22.md`
