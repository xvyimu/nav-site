# ADR-007: Navigation state and information architecture modules

Status: Accepted
Date: 2026-07-06
Deciders: nav-site maintainers

## Context

The home navigation experience combines several concerns in one public hook:

- URL state for `q`, `cat`, `tag`, `minRating`, `popularity`, and `semantic`
- server search debounce and abort handling
- derived information architecture data such as tabs, category trees, sections, and flat results
- keyboard navigation, result focus, and click tracking

The hook already had internal sections, but file-level boundaries were still shallow. Future changes to
category hierarchy, tag combinations, SEO links, or keyboard behavior would require reviewing the full
navigation hook.

## Decision

Keep `components/useLinksFilter.ts` as the compatibility facade for `Navigation`, and move the internals
behind explicit modules:

- `lib/navigation/url-state.ts` owns URL parsing and serialization.
- `components/navigation/useFilterState.ts` owns filter state, URL synchronization, and sort-mode storage.
- `components/navigation/useServerSearch.ts` owns debounced server search and response mapping.
- `components/navigation/useDerivedLinks.ts` owns tabs, category tree data, sections, and flat results.
- `components/navigation/useKeyboardNav.ts` owns focus, shortcuts, and result keyboard behavior.

The public return shape of `useLinksFilter` remains unchanged.

## Consequences

- Positive: URL rules are now testable as pure functions.
- Positive: search debounce, IA derivation, and keyboard behavior have separate locality.
- Positive: future category/tag/SEO work can change one module without reopening the full hook.
- Negative: there are more files to navigate.
- Risk: accidental API drift in `useLinksFilter`; existing hook tests remain the compatibility guard.

## Verification

- `tests/navigation-url-state.test.ts` covers URL parse/serialize rules.
- `components/useLinksFilter.test.ts` covers the public hook behavior.
- Full project typecheck, lint, test, and build remain required before shipping.

## Revisit triggers

- URL parameters change for SEO or shareable views.
- Navigation gains saved views or multi-sort modes.
- Category landing pages become statically generated SEO pages.
