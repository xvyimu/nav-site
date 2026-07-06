# ADR-006: Repository domain modules rollout

Status: Accepted
Date: 2026-07-06
Deciders: nav-site maintainers

## Context

`lib/repositories.ts` is the app-wide data access facade. It gives callers useful leverage because pages and API routes do not talk to Supabase directly. The cost is that one interface now covers public reads, admin writes, reviews, favorites, submissions, tags, missing migration handling, RLS notes, and service role behavior.

The broad facade has become shallow for maintainers: review privacy, favorites authorization, optional tag fallback, and admin write semantics all live in the same implementation file. Tests also need a large `MockDB` that simulates many unrelated Supabase chains.

## Decision

Keep `lib/repositories.ts` as the compatibility facade, but move implementation into domain modules behind it.

Rollout order:

1. `lib/repositories/shared.ts` for common errors and row mapping helpers.
2. `lib/repositories/reviews.ts` for tool reviews and review rate limits.
3. `lib/repositories/favorites.ts` for user favorites.
4. `lib/repositories/links.ts` for public link reads and tool detail helpers.
5. `lib/repositories/categories.ts` for public and admin category operations.
6. `lib/repositories/tags.ts` for tag CRUD and link-tag joins.
7. `lib/repositories/admin-links.ts` for admin link CRUD.
8. `lib/repositories/submissions.ts` for public submit and click lookup helpers.

Callers keep importing from `@/lib/repositories` during the rollout. Domain tests may import the new modules directly to make each module interface explicit.

## Considered Alternatives

- Keep one file: no migration cost, but locality keeps getting worse.
- Rewrite all repository code at once: reaches the target faster, but the diff is too risky for a production-ready project.
- Introduce an ORM: does not solve the current interface width or permission locality problem.

## Consequences

- Positive: reviews and favorites gain separate locality for privacy, migration, and service role behavior.
- Positive: tests can target domain interfaces instead of one broad MockDB surface.
- Negative: facade and domain modules coexist by design, but the facade is now re-export only.
- Risk: duplicated helpers during migration. Shared behavior should move to `shared.ts` only when a second domain needs it.

## Revisit triggers

- `lib/repositories.ts` starts accumulating new implementation instead of re-exporting domain modules.
- A domain module grows a wide interface that mirrors the old facade.
- Supabase Auth replaces NextAuth for user identity, changing favorites RLS assumptions.
