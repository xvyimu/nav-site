import { createClient } from "@supabase/supabase-js";

const DEFAULT_RESOURCE_LIBRARY_URL = "https://ihnmfsfbfnctgkhxmghk.supabase.co";

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

/** 允许 env 覆盖；未设置时回落默认 RL 项目 URL（与历史行为一致） */
export function getResourceLibraryUrl(): string {
  const fromEnv =
    process.env.RESOURCE_LIBRARY_SUPABASE_URL?.trim() ||
    process.env.RESOURCE_LIBRARY_URL?.trim() ||
    "";
  return fromEnv || DEFAULT_RESOURCE_LIBRARY_URL;
}

export const RESOURCE_LIBRARY_URL = getResourceLibraryUrl();

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
  return createClient(getResourceLibraryUrl(), key, SUPABASE_CLIENT_OPTIONS);
}

/**
 * 公开读路径：仅 anon。
 * 生产禁止回落 service_role（避免误配时公开流量持有全库权限）。
 * 非生产仍可回落 service_role 便于本地无 anon 调试。
 */
export function createResourceLibraryReadClient() {
  const anonKey = getResourceLibraryAnonKey();
  if (anonKey) {
    return {
      client: createResourceLibraryClient(anonKey),
      credential: "anon" as const,
      pagesSource: getResourceLibraryPublicPagesSource(),
    };
  }

  if (isProductionRuntime()) {
    return null;
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
