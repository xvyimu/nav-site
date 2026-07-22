# Security headers DRIFT · trace note · 2026-07

> **Read-only.** No `next.config.ts` / `proxy.ts` / env / Cloudflare / Vercel console changes.  
> Goal: re-confirm live vs repo contract with the Wave8 probe, and narrow **where** the override is likely — not ship a fix.

## Identity

| Field | Value |
| --- | --- |
| Date | 2026-07-23 |
| Branch | `xvyimu/w1-cp-claude` |
| HEAD | `38d296acb1c9f7f253a484761d1336c840cd89a4` |
| Worktree | `C:\Users\yuanjia\orca\workspaces\ChronoPortal\w1-cp-claude` |
| Probe | `scripts/probe-security-headers.mjs` · `pnpm run probe:headers` |
| Production host | `yuanjia1314.ccwu.cc` (blocked unless `--allow-production`) |

## Repo contract (source)

From `next.config.ts` `securityHeaders` (and `REPO_HEADER_CONTRACT` in the probe):

| Header | Value |
| --- | --- |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| CSP enforce / RO | Built via `lib/csp.ts` defaults (static path when `CSP_DYNAMIC` off) |

No `vercel.json` headers override exists in-repo.

## Observations (2026-07-23)

### A. Production canary policy (negative control)

```text
node scripts/probe-security-headers.mjs --base-url https://yuanjia1314.ccwu.cc --json
→ exit 1, blocked=true (production host without --allow-production)
```

### B. Production explicit allow + compare-repo

```text
pnpm run probe:headers -- --base-url https://yuanjia1314.ccwu.cc --allow-production --compare-repo --json
→ exit 0, HTTP 200
```

| Header | Expected (repo) | Actual (live) | Match |
| --- | --- | --- | --- |
| `x-frame-options` | `DENY` | **`SAMEORIGIN`** | **DRIFT** |
| `referrer-policy` | `strict-origin-when-cross-origin` | **`same-origin`** | **DRIFT** |
| `x-content-type-options` | `nosniff` | `nosniff` | OK |
| `permissions-policy` | cam/mic/geo denied | matches | OK |

Additional live-only (not in repo `securityHeaders` array):

| Header | Live value | Note |
| --- | --- | --- |
| `x-xss-protection` | `1; mode=block` | Platform/edge candidate |
| `expect-ct` | `max-age=86400, enforce` | Platform/edge candidate |
| `Server` | `cloudflare` | Edge in path |
| `x-vercel-*` | present (`x-vercel-cache`, `x-vercel-id`) | Origin is Vercel |

CSP enforce still includes `script-src … 'unsafe-inline'`; Report-Only omits script unsafe-inline and reports to `/api/csp-report` — consistent with repo defaults (not a new DRIFT class).

### C. Deployed app commit (read-only)

`GET https://yuanjia1314.ccwu.cc/build-info.json`:

```json
{
  "commit": "46e71ec38e3828b892058f7e059f88478807434b",
  "branch": "master",
  "deployId": "dpl_rGFZxkqt2SoBoytDECx7oNBs9ceF",
  "generatedAt": "2026-07-22T03:13:18.597Z"
}
```

Production is **behind** worktree tip `38d296ac`. Prior AS-IS note already established that **commit `46e71ec` itself declares XFO `DENY` and Referrer `strict-origin-when-cross-origin` in `next.config.ts`**, so the live mismatch is **not** explained by “old code still has SAMEORIGIN”. Layer is **platform / edge response rewrite** until proven otherwise.

### D. Local default BASE

```text
pnpm run probe:headers -- --base-url http://127.0.0.1:3264 --compare-repo --json
→ exit 1, reason "fetch failed" (dev server not running this session)
```

Expected; does not refute production DRIFT.

### E. Edge script audit (related canary preflight)

```text
node scripts/audit-edge-scripts.mjs → exit 0
mangledScriptTypeCount=0 · rocketLoaderHints=false
```

No Rocket Loader–style type mangling on the sampled production homepage.

## Trace hypotheses (ordered)

| # | Hypothesis | Evidence for | Evidence against / gap | Next proof (operator) |
| --- | --- | --- | --- | --- |
| H1 | **Cloudflare Transform / Managed Headers / Page Rule** rewrites XFO + Referrer | `Server: cloudflare`; live values common in CF defaults; extra `expect-ct` / `x-xss-protection` | Need CF dashboard / API dump of Transform Rules | CF zone: list Transform Rules + “Security Headers” products for `yuanjia1314.ccwu.cc` |
| H2 | **Vercel project / deployment Headers** override after Next | `x-vercel-*` present; no repo `vercel.json` | Need Vercel project Headers UI / `vercel inspect` | Compare Preview `*.vercel.app` **without** custom domain (bypass CF) |
| H3 | **App middleware / proxy** overwrites static headers | Dynamic CSP path exists in `proxy.ts` only when `CSP_DYNAMIC=1` | Live CSP still static-shaped; no code path sets XFO `SAMEORIGIN` found | Grep already clean; unit tests don’t set XFO |
| H4 | **Stale CDN cache of older header set** | CF `cf-cache-status` sometimes HIT | Probe also saw MISS with same DRIFT; build-info commit already has DENY in source | Purge + re-probe under owner approval |

**Working conclusion (W1):** DRIFT is **real and reproducible**. Most likely **edge/platform rewrite outside Next `headers()`**, not a missing line in current `next.config.ts`. **Do not** “fix” by editing Next headers until H1/H2 is confirmed on **Preview or direct Vercel hostname**.

## What not to do (reaffirmed)

| Action | Why |
| --- | --- |
| Change `next.config.ts` XFO/Referrer “to match live” | Would codify weaker posture or still be overridden |
| Change live CF/Vercel without owner | Out of band; production impact |
| Treat DRIFT as CSP_DYNAMIC failure | Orthogonal; CSP values match static contract |
| Claim production is non-compliant without citing deploy commit | Deploy is `46e71ec`; tip has probe tooling only |

## Recommended W2 proof sequence (operator)

1. Deploy/open a **Preview** URL (no custom domain) → `pnpm run probe:headers -- --base-url <preview> --compare-repo`.  
   - If Preview matches repo → **CF/custom domain layer** owns DRIFT.  
   - If Preview also drifts → **Vercel project headers** or framework emission issue.  
2. Optional: curl Vercel deployment URL with `Host` / without CF proxy (if DNS split exists).  
3. Only then open a change ticket with layer + rollback.

### W2 follow-up (2026-07-23)

- Production DRIFT **reconfirmed** (same XFO/Referrer mismatch; build-info still `46e71ec…`).  
- **Platform remediation playbook** (still no prod CF/Vercel edits):  
  `docs/ops/headers-drift-platform-remediation-2026-07.md`  
- P1 Preview probe **blocked on this agent host**: `*.vercel.app` connect timeout while custom-domain prod remains reachable — same network class as CSP Stage A blocker.

## Cross-links

- `docs/ops/security-headers-as-is-target-2026-07-22.md`
- `docs/ops/security-headers-matrix-2026-07-22.md`
- `docs/ops/headers-drift-platform-remediation-2026-07.md`
- `docs/ops/wave8-chronoportal-claude.md` (probe introduction)
- `docs/ops/w1-arch-upgrade-chronoportal-claude.md`
- `docs/ops/w2-arch-upgrade-chronoportal-claude.md`
