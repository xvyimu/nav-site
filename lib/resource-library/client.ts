import { createClient } from "@supabase/supabase-js";

export const RESOURCE_LIBRARY_URL = "https://ihnmfsfbfnctgkhxmghk.supabase.co";
export const RESOURCE_LIBRARY_SAFE_PAGE_COLUMNS =
  "id,title,url,domain,summary,category,tags,crawled_at";

const SUPABASE_CLIENT_OPTIONS = {
  auth: { autoRefreshToken: false, persistSession: false },
};

export function getResourceLibraryServiceRoleKey(): string {
  return process.env.RESOURCE_LIBRARY_SERVICE_ROLE_KEY || "";
}

export function getResourceLibraryAnonKey(): string {
  return (
    process.env.RESOURCE_LIBRARY_ANON_KEY ||
    process.env.RESOURCE_LIBRARY_SUPABASE_ANON_KEY ||
    ""
  );
}

export function getResourceLibraryPublicPagesSource(): string {
  return process.env.RESOURCE_LIBRARY_PUBLIC_PAGES_SOURCE || "public_pages";
}

export function getResourceLibraryPublicRatingStatsRpc(): string {
  return (
    process.env.RESOURCE_LIBRARY_PUBLIC_RATING_STATS_RPC ||
    "get_public_resource_rating_count"
  );
}

function createResourceLibraryClient(key: string) {
  return createClient(RESOURCE_LIBRARY_URL, key, SUPABASE_CLIENT_OPTIONS);
}

export function createResourceLibraryReadClient() {
  const anonKey = getResourceLibraryAnonKey();
  if (anonKey) {
    return {
      client: createResourceLibraryClient(anonKey),
      credential: "anon" as const,
      pagesSource: getResourceLibraryPublicPagesSource(),
    };
  }

  const serviceRoleKey = getResourceLibraryServiceRoleKey();
  if (!serviceRoleKey) return null;

  return {
    client: createResourceLibraryClient(serviceRoleKey),
    credential: "service_role" as const,
    pagesSource: "pages",
  };
}

export function createResourceLibraryServiceClient() {
  const serviceRoleKey = getResourceLibraryServiceRoleKey();
  return serviceRoleKey ? createResourceLibraryClient(serviceRoleKey) : null;
}

export function createResourceLibraryPublicRatingStatsClient() {
  const anonKey = getResourceLibraryAnonKey();
  if (!anonKey) return null;

  return {
    client: createResourceLibraryClient(anonKey),
    rpcName: getResourceLibraryPublicRatingStatsRpc(),
  };
}
