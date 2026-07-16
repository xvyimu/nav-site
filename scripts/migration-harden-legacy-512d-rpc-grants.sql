-- Harden legacy 512-d embedding RPCs (parity with S0 v2 grants).
-- Applied to production as migration harden_legacy_512d_rpc_grants (2026-07-16).
-- Safe to re-run.

REVOKE EXECUTE ON FUNCTION public.update_link_embedding(uuid, vector) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_link_embedding(uuid, vector) TO service_role;
ALTER FUNCTION public.update_link_embedding(uuid, vector) SET search_path = public, extensions;
ALTER FUNCTION public.update_link_embedding(uuid, vector) SECURITY INVOKER;

REVOKE EXECUTE ON FUNCTION public.search_links_semantic(vector, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_links_semantic(vector, integer) TO service_role;
ALTER FUNCTION public.search_links_semantic(vector, integer) SET search_path = public, extensions;
