import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import {
  RESOURCE_LIBRARY_URL,
  getResourceLibraryAnonKey,
} from "@/lib/resource-library/client";
import {
  buildEmbedRequestHeaders,
  describeEmbedSkipReason,
  resolveEmbedEndpoint,
} from "@/lib/embedding-runtime";

const RL_URL = RESOURCE_LIBRARY_URL;
const PROBE_TIMEOUT_MS = 5000;
const EMBED_PROBE_TIMEOUT_MS = 8000;
const DEFAULT_EMBED_SERVER_URL = "http://127.0.0.1:8003";
const EXPECTED_EMBED_DIM = 512;
const STATUS_CACHE_CONTROL =
  "public, max-age=15, s-maxage=30, stale-while-revalidate=60";

export const dynamic = "force-dynamic";

type StatusBody = {
  available: boolean;
  vector: boolean;
  rpc: boolean;
  reason?: string;
};

function statusResponse(body: StatusBody) {
  return NextResponse.json(body, {
    headers: { "Cache-Control": STATUS_CACHE_CONTROL },
  });
}

async function probeRpc(anonKey: string): Promise<boolean> {
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
      return false;
    }
    return true;
  } catch (e) {
    logger.warn("Resource search health probe failed", {
      source: "resource-search-status",
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

async function probeEmbed(): Promise<{ ok: boolean; reason?: string }> {
  const resolved = resolveEmbedEndpoint({
    raw: process.env.EMBED_SERVER_URL,
    fallback: DEFAULT_EMBED_SERVER_URL,
    path: "/health",
  });

  if (resolved.endpoint === null) {
    return {
      ok: false,
      reason:
        resolved.reason === "missing"
          ? "embed_not_configured"
          : `embed_${describeEmbedSkipReason(resolved.reason).replace(/\s+/g, "_")}`,
    };
  }

  try {
    const res = await fetch(resolved.endpoint, {
      method: "GET",
      headers: buildEmbedRequestHeaders({ json: false }),
      signal: AbortSignal.timeout(EMBED_PROBE_TIMEOUT_MS),
    });

    if (!res.ok) {
      return { ok: false, reason: "embed_http_error" };
    }

    const data = (await res.json()) as { status?: string; dim?: number };
    if (data.status !== "ok" || data.dim !== EXPECTED_EMBED_DIM) {
      return { ok: false, reason: "embed_invalid" };
    }

    return { ok: true };
  } catch (e) {
    logger.warn("Resource embed health probe failed", {
      source: "resource-search-status",
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, reason: "embed_unreachable" };
  }
}

export async function GET() {
  const anonKey = getResourceLibraryAnonKey();
  if (!anonKey) {
    return statusResponse({
      available: false,
      vector: false,
      rpc: false,
      reason: "missing_key",
    });
  }

  const [rpcOk, embed] = await Promise.all([probeRpc(anonKey), probeEmbed()]);
  const vectorOk = rpcOk && embed.ok;

  let reason: string | undefined;
  if (!rpcOk && !embed.ok) reason = "rpc_and_embed_unavailable";
  else if (!rpcOk) reason = "rpc_unavailable";
  else if (!embed.ok) reason = embed.reason ?? "embed_unavailable";

  return statusResponse({
    // available = 向量搜索可真正使用（RPC + embed 均就绪）
    available: vectorOk,
    vector: vectorOk,
    rpc: rpcOk,
    ...(reason ? { reason } : {}),
  });
}
