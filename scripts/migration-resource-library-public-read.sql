-- Resource Library public-read boundary for nav-site.
-- Run this in the Resource Library Supabase project, not the nav-site project.
--
-- Goal:
-- - Let nav-site read public resource pages with an anon key.
-- - Keep ratings IP data private.
-- - Expose only an aggregate rating-count RPC to anon/authenticated.
--
-- References:
-- - Supabase API security: grants + RLS both matter.
-- - Postgres 15+ views should use security_invoker when relying on underlying RLS.

begin;

alter table public.pages enable row level security;

revoke all on table public.pages from anon, authenticated;
grant select (
  id,
  title,
  url,
  domain,
  summary,
  category,
  tags,
  crawled_at
) on table public.pages to anon, authenticated;

drop policy if exists "Public resource pages are readable" on public.pages;
create policy "Public resource pages are readable"
on public.pages
for select
to anon, authenticated
using (true);

create or replace view public.public_pages
with (security_invoker = true)
as
select
  id,
  title,
  url,
  domain,
  summary,
  category,
  tags,
  crawled_at
from public.pages;

grant select on table public.public_pages to anon, authenticated;

-- Ratings may contain IP addresses. Do not grant SELECT on public.ratings to anon.
-- This SECURITY DEFINER function exposes only the aggregate count for one page.
alter table public.ratings enable row level security;
revoke all on table public.ratings from anon, authenticated;

create or replace function public.get_public_resource_rating_count(target_page_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.ratings
  where page_id = target_page_id;
$$;

revoke all on function public.get_public_resource_rating_count(uuid) from public;
grant execute on function public.get_public_resource_rating_count(uuid) to anon, authenticated;

commit;
