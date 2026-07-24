# M-CP-links-pool · evidence · 2026-07-24

| 项 | 值 |
|----|-----|
| Module | M-CP-links-pool (W3) |
| Branch | `xvyimu/cp-links-pool` |
| Scope | 链接池 / 并发相同 `getApprovedLinks` 去重（in-flight coalesce） |
| Stack lock | Next 16 App Router + webpack · React 19 · shadcn · Supabase RLS · Auth.js v5 |
| Ban | push master · 去 webpack · 绕 RLS · 改它仓 · 放宽 CSP · 生产 env · 空口完成 · Meili · 微服务 |

## 1. As-is

| Surface | Behavior before |
|---------|-----------------|
| `getApprovedLinks` | `React.cache()` only — same request tree / same **options object identity** |
| Concurrent callers | Distinct `AbortSignal` / options objects → **multiple** Supabase round-trips |
| `lib/search/fuse.ts` | Already has `poolLoadPromise` singleflight for search pool (out of scope change) |

## 2. Change (minimal)

1. **`lib/request-coalesce.ts`** — `coalesceInFlight(key, factory, signal?)`  
   - Concurrent same key → one factory  
   - No result TTL cache (only in-flight join)  
   - Per-waiter `signal` aborts **wait only**, not shared work  

2. **`lib/repositories/links.ts`** — `getApprovedLinks`  
   - Key: `getApprovedLinks:limit=…:offset=…` (signal **not** in key)  
   - Shared fetch does not bind query `abortSignal` to one waiter  

3. **`tests/request-coalesce.test.ts`** — unit + concurrent repository proof  

**Public API contract:** unchanged (same return shape / errors).

## 3. Explicit non-changes

| Item | Why |
|------|-----|
| Meili / search engine | Module ban |
| Microservice split | Module ban |
| fuse.ts pool TTL | Already coalesced; W7 search-payload |
| revalidate tags | W6 |
| Auth admin dedupe | W4 |

## 4. Verification (this session)

| Command | Exit | Notes |
|---------|-----:|-------|
| `pnpm typecheck` | **2** | **既有红** only: `tests/probe-security-headers.test.ts` ProcessEnv / index (L31/65/73/132/155). No errors in `lib/request-coalesce.ts` / `lib/repositories/links.ts` / new tests |
| `pnpm exec vitest run tests/request-coalesce.test.ts tests/repositories.test.ts` | **0** | **2** files · **63** tests |

```text
pnpm typecheck
# TYPECHECK_EXIT=2  (pre-existing probe-security-headers.test.ts only)

pnpm exec vitest run tests/request-coalesce.test.ts tests/repositories.test.ts
# VITEST_EXIT=0  (63 passed)
```

## 5. Risk (one line)

**Risk:** One waiter’s abort no longer cancels the shared Supabase fetch (by design); a cancelled page still holds the in-flight work until peers finish or the query completes.

## 6. Status

```text
module: M-CP-links-pool
status: DONE
workspace-status: in-review
prod_csp_flip: NOT_EXECUTED
rls_flip: NOT_EXECUTED
meili: NOT_INTRODUCED
push_master: NOT_DONE
```
