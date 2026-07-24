# M-CP-home-static-client · evidence · 2026-07-24

| 项 | 值 |
|----|-----|
| Module | M-CP-home-static-client |
| Branch | `xvyimu/cp-home-static-client` |
| Scope | 首页 static/client 边界复核 + 可测增量 |
| Stack lock | Next 16 App Router + webpack · React 19 · shadcn · Supabase RLS · Auth.js v5 |
| Ban | push master · 去 webpack · 绕 RLS · 改它仓 · 放宽 CSP · 生产 env · 空口完成 |

## 1. Boundary audit (as-is)

| Surface | Role | Client? | Notes |
|---------|------|---------|-------|
| `app/page.tsx` | RSC fetch categories/links + precompute tabs/tags | **Server** | `revalidate=60`; repository only (no client cold-fetch of nav data) |
| `app/loading.tsx` | Route transition skeleton | Server | `NavSkeleton` (no hooks) |
| `components/Navigation.tsx` | Filter state, hero, sidebar, atlas, preview | **Client** | Necessary: hooks + dynamic MobileNav/ToolQuickView |
| `components/HomeHero.tsx` | Hero copy + SearchBar + category pills | Client | Imported only by Navigation → already in client graph; pure metrics subtrees not worth a separate RSC island (would still hydrate under client parent) |
| `components/NavSkeleton.tsx` | Pulse placeholders | Server-safe | No `"use client"` |
| `components/ErrorBoundary.tsx` | Class boundary + dynamic Sentry | Client | Required for error UI |
| `lib/nav-derived-data.ts` | Pure precompute | Shared | RSC builds `PrecomputedNavData`; client skips 5 rebuilds when provided |
| `useServerSearch` | `/api/search` only when `rawSearch` non-empty | Client | No cold pull of categories/links |
| Search / facets empty-query | Local `buildSearchFacets(links, …)` | Client | Uses RSC-passed `links` |

**Confirmed non-goals this module:** virtual list, API contract change, stack swap.

## 2. Defect found (actionable)

**Shareable URL filters were client-only.**

- `useFilterState` used `readInitialFilters()` → on SSR `typeof window === "undefined"` → always `DEFAULT_NAVIGATION_FILTERS` (`cat=all`, empty tags).
- First paint for `/?cat=ai` SSR’d the full “all” atlas; after hydrate, client re-read `window.location` (or worse, `replaceState` effect could fight URL if state lagged).
- RSC already computed CollectionPage JSON-LD from `?cat=` but **did not seed** Navigation filter state.

## 3. Incremental fix (this wave)

1. **`parseFiltersFromSearchParams`** in `lib/navigation/url-state.ts` — App Router record / `URLSearchParams` → `ParsedUrlFilters`.
2. **`app/page.tsx`** — parse full `searchParams`, pass `initialFilters` + existing `precomputed` into `Navigation`.
3. **`useFilterState(initialFilters?)` / `useLinksFilter` / `Navigation`** — seed state from RSC prop when present.
4. **Remove inner `<Suspense fallback={<NavSkeleton />}>`** around `Navigation` — data already awaited in the page; skeleton remains via `app/loading.tsx` for navigations. No streaming benefit from wrapping a client child of resolved props.

## 4. Explicit non-changes

| Item | Why |
|------|-----|
| Split HomeHero to RSC | Parent is client; island would not shrink hydrate graph meaningfully without larger Navigation re-architecture |
| Drop `"use client"` on leaf presentational files imported only by client parents | No runtime win; noise |
| Virtual list / DualTrack rewrite | Module ban / prior perf wave |
| `sortMode` localStorage SSR parity | Pre-existing; out of URL-seed scope |

## 5. Risk (one line)

**Risk:** Deep-linked `?q=` still shows empty results until client search fetch completes (EmptyState gated by `mounted`); category-only `?cat=` is correct on first paint.

## 6. Verification

| Command | Exit | Notes |
|---------|-----:|-------|
| `pnpm typecheck` | **2** | **既有红**（非本模块）：`tests/probe-security-headers.test.ts` ProcessEnv / index 类型（L31/65/73/132/155）；本波未改该文件 |
| `pnpm exec vitest run tests/frontend-performance.test.tsx tests/navigation-url-state.test.ts` | **0** | **24** tests passed |
| `pnpm run probe:headers` | skip | 非本模块必跑；prod header DRIFT 历史已知 |

本模块改动面 type 路径：`app/page.tsx` · `Navigation` · `useFilterState` · `useLinksFilter` · `url-state` — tsc 未报这些文件错误。

## 7. Status

**DONE · in-review** — feature branch commit only; no push master.
