import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import {
  RESOURCE_LIBRARY_URL,
  getResourceLibraryAnonKey,
} from "@/lib/resource-library/client";

const RL_URL = RESOURCE_LIBRARY_URL;
const PROBE_TIMEOUT_MS = 5000;
const STATUS_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

export const dynamic = "force-dynamic";

function statusResponse(body: { available: boolean; reason?: string }) {
  return NextResponse.json(body, {
    headers: { "Cache-Control": STATUS_CACHE_CONTROL },
  });
}

export async function GET() {
  const anonKey = getResourceLibraryAnonKey();
  if (!anonKey) {
    return statusResponse({ available: false, reason: "missing_key" });
  }

  try {
    const supabase = createClient(RL_URL, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await supabase
      .rpc("resource_search_health")
      .abortSignal(AbortSignal.timeout(PROBE_TIMEOUT_MS));

    if (error) {
      logger.warn("Resource search health RPC unavailable", {
        source: "resource-search-status",
        code: error.code,
      });
      return statusResponse({ available: false, reason: "rpc_unavailable" });
    }
    return statusResponse({ available: true });
  } catch (e) {
    logger.warn("Resource search health probe failed", {
      source: "resource-search-status",
      error: e instanceof Error ? e.message : String(e),
    });
    return statusResponse({ available: false, reason: "probe_failed" });
  }
}
