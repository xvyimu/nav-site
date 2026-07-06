import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { withTimeout } from "@/lib/utils";

// Probe rl project's search_pages_vector RPC availability
const RL_URL = "https://ihnmfsfbfnctgkhxmghk.supabase.co";
const RL_SERVICE_ROLE = process.env.RESOURCE_LIBRARY_SERVICE_ROLE_KEY || "";
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
  if (!RL_SERVICE_ROLE) {
    return statusResponse({ available: false, reason: "missing_key" });
  }

  try {
    const supabase = createClient(RL_URL, RL_SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await withTimeout(
      Promise.resolve(
        supabase.rpc("search_pages_vector", {
          query_embedding: Array(512).fill(0),
          max_results: 1,
        })
      ),
      PROBE_TIMEOUT_MS,
      "Resource vector search probe timed out"
    );

    if (error) {
      logger.warn("Resource vector search RPC unavailable", {
        source: "resource-search-status",
        code: error.code,
      });
      return statusResponse({ available: false, reason: "rpc_unavailable" });
    }
    return statusResponse({ available: true });
  } catch (e) {
    logger.warn("Resource vector search probe failed", {
      source: "resource-search-status",
      error: e instanceof Error ? e.message : String(e),
    });
    return statusResponse({ available: false, reason: "probe_failed" });
  }
}
