# Wave 8 · ChronoPortal · Claude

## Worktree identity

| Field | Value |
| --- | --- |
| Baseline tip (start) | `984e08e9f56750121d21d9551c702ea028094a27` |
| Branch | `xvyimu/wave8-cp-claude` |
| Worktree | `C:\Users\yuanjia\orca\workspaces\ChronoPortal\wave8-cp-claude` |
| Agent | claude |
| Scope | One cut: read-only security-headers probe + LAUNCH/P0 board chain to `icons:pwa` / headers matrix. No next.config/proxy/env/publish. |

## Delivered

1. **Read-only headers probe**
   - `scripts/probe-security-headers.mjs` + `tests/probe-security-headers.test.ts`
   - npm script: `pnpm run probe:headers`
   - Configurable BASE via `--base-url` / `HEADERS_PROBE_BASE_URL` / `BASE_URL`
   - Default BASE: `http://127.0.0.1:3264` (local dev; not production)
   - **Production custom domain blocked as canary** (`yuanjia1314.ccwu.cc`) unless `--allow-production` or `HEADERS_PROBE_ALLOW_PRODUCTION=1`
   - Optional `--compare-repo` diffs live headers vs `next.config.ts` contract (`X-Frame-Options: DENY`, etc.)
   - Does **not** modify `next.config.ts`, `proxy.ts`, env, Cloudflare, Vercel, or Supabase

2. **LAUNCH / P0 board chain**
   - `docs/LAUNCH-CHECKLIST.md` §上线前 step 3: `pnpm run icons:pwa` + headers matrix paths + `probe:headers`
   - `docs/ops/L2-P0-action-board-2026-07-22.md`: commands table links icons, matrix, AS-IS/TARGET, probe, LAUNCH
   - `docs/ops/security-headers-matrix-2026-07-22.md`: safe local commands include `probe:headers`

## Explicit non-actions (Wave8 bans)

| Not done | Why |
| --- | --- |
| Real publish / deploy / push to default branch | Total-control merge only |
| D7 | Out of scope |
| Production `CSP_DYNAMIC=1` / strip script `'unsafe-inline'` | Deferred; preview canary only |
| Production RLS policy/schema changes | Deferred |
| ISS features | Forbidden this wave |
| `next.config.ts` / `proxy.ts` edits | Probe is observation-only |

## Live observation (read-only, explicit allow)

With `--allow-production --compare-repo` against `https://yuanjia1314.ccwu.cc` (2026-07-22):

| Header | Repo contract | Live | Match |
| --- | --- | --- | --- |
| `x-frame-options` | `DENY` | `SAMEORIGIN` | DRIFT |
| `referrer-policy` | `strict-origin-when-cross-origin` | `same-origin` | DRIFT |
| `x-content-type-options` | `nosniff` | `nosniff` | OK |
| `permissions-policy` | cam/mic/geo denied | matches | OK |

Matches prior wave6/wave7 evidence; **no config change** authorized to “fix” edge drift.

## Verification

| Command | Exit | Result |
| --- | ---: | --- |
| `pnpm exec vitest run tests/probe-security-headers.test.ts` | 0 | 1 file / 6 tests passed |
| `node scripts/probe-security-headers.mjs --base-url https://yuanjia1314.ccwu.cc --json` | 1 | Blocked (production canary policy) as designed |
| `node scripts/probe-security-headers.mjs --help` | 0 | Help printed |
| `pnpm run probe:headers -- --base-url https://yuanjia1314.ccwu.cc --allow-production --compare-repo --json` | 0 | HTTP 200; key headers + DRIFT rows printed |
| `pnpm run icons:pwa` | 0 | `icon-192.png` / `icon-512.png` rewritten (deterministic generator) |
| `git diff --check` | 0 | No whitespace errors |

## DEFER (unchanged ownership)

| Item | Owner |
| --- | --- |
| Trace/fix live XFO / Referrer-Policy drift | App + platform operator |
| Production CSP_DYNAMIC / unsafe-inline cutover | Authorized prod op after Preview canary |
| Production RLS | Database owner |
| Merge/push this branch to master | Total-control |

## Files touched

- `scripts/probe-security-headers.mjs` (new)
- `tests/probe-security-headers.test.ts` (new)
- `package.json` (`probe:headers`)
- `docs/LAUNCH-CHECKLIST.md`
- `docs/ops/L2-P0-action-board-2026-07-22.md`
- `docs/ops/security-headers-matrix-2026-07-22.md`
- `docs/ops/wave8-chronoportal-claude.md` (this report)
- `public/icon-192.png` / `public/icon-512.png` (regen via `icons:pwa`; may be byte-identical)

## Stop

Wave8 Claude cut complete. No push/merge. Awaiting total-control absorb.
