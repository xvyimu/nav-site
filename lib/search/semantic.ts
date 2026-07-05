import { createServiceRoleClient } from "@/lib/supabase/server";
import { describeEmbedSkipReason, resolveLoopbackEmbedEndpoint } from "@/lib/embedding-runtime";
import { logger } from "@/lib/logger";
import type { NavLink } from "@/lib/types";
import type { SearchResult, SemanticRow } from "./types";

/**
 * 嵌入向量 + pgvector 语义搜索
 *
 * 这里隔离了两件外部依赖：
 * 1. 本地嵌入微服务（EMBED_SERVER_URL，必须 loopback）；
 * 2. Supabase 的 `search_links_semantic` RPC（service_role 客户端调用）。
 *
 * 任意一处失败都返回空数组，让上层降级为纯 Fuse 排序，
 * 不会把 5xx 抛到路由层。
 */

const DEFAULT_EMBED_SERVER_URL = "http://127.0.0.1:8003";
const MIN_SEMANTIC_SIMILARITY = 0.35;
const EMBED_REQUEST_TIMEOUT_MS = 5000;
const EMBED_UNAVAILABLE_TTL_MS = 30_000;
const EMBED_WARNING_THROTTLE_MS = 60_000;

let unavailableEndpoint: string | null = null;
let unavailableUntil = 0;
const lastWarningAt = new Map<string, number>();

function warnThrottled(key: string, message: string, context: Record<string, unknown>): void {
  const now = Date.now();
  const last = lastWarningAt.get(key);
  if (last !== undefined && now - last < EMBED_WARNING_THROTTLE_MS) return;

  lastWarningAt.set(key, now);
  logger.warn(message, context);
}

function isTemporarilyUnavailable(endpoint: string): boolean {
  return unavailableEndpoint === endpoint && Date.now() < unavailableUntil;
}

function markTemporarilyUnavailable(endpoint: string): void {
  unavailableEndpoint = endpoint;
  unavailableUntil = Date.now() + EMBED_UNAVAILABLE_TTL_MS;
}

function clearTemporarilyUnavailable(endpoint: string): void {
  if (unavailableEndpoint !== endpoint) return;
  unavailableEndpoint = null;
  unavailableUntil = 0;
}

/**
 * 解析 EMBED_SERVER_URL 为 /embed-query 完整端点。
 *
 * 安全约束：必须是 http/https 且 host 为 loopback，
 * 避免被环境变量误导去打外部地址。
 */
export function getEmbedEndpoint(): string | null {
  const { endpoint, reason } = resolveLoopbackEmbedEndpoint({
    raw: process.env.EMBED_SERVER_URL,
    fallback: DEFAULT_EMBED_SERVER_URL,
    path: "/embed-query",
  });

  if (endpoint !== null) return endpoint;

  if (reason !== "missing") {
    warnThrottled(`embed-config:${reason}`, "Ignoring EMBED_SERVER_URL", {
      source: "api-search",
      reason: describeEmbedSkipReason(reason),
    });
  }

  return null;
}

/**
 * 调用本地嵌入微服务生成向量
 *
 * @param text - 需要向量化的文本
 * @returns 512 维归一化向量数组，失败时返回 null
 */
export async function getEmbedding(text: string): Promise<number[] | null> {
  const endpoint = getEmbedEndpoint();
  if (!endpoint) return null;
  if (isTemporarilyUnavailable(endpoint)) return null;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(EMBED_REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      markTemporarilyUnavailable(endpoint);
      warnThrottled(`embed-server:${endpoint}:http`, "Embed server error", {
        status: res.status,
        source: "api-search",
        retryAfterMs: EMBED_UNAVAILABLE_TTL_MS,
      });
      return null;
    }

    const data = await res.json();
    if (!Array.isArray(data.embedding) || data.embedding.length === 0) {
      markTemporarilyUnavailable(endpoint);
      warnThrottled(`embed-server:${endpoint}:payload`, "Embed server returned invalid payload", {
        source: "api-search",
        retryAfterMs: EMBED_UNAVAILABLE_TTL_MS,
      });
      return null;
    }

    clearTemporarilyUnavailable(endpoint);
    return data.embedding as number[];
  } catch (e) {
    markTemporarilyUnavailable(endpoint);
    warnThrottled(`embed-server:${endpoint}:request`, "Embed server request failed", {
      source: "api-search",
      error: e instanceof Error ? e.message : String(e),
      retryAfterMs: EMBED_UNAVAILABLE_TTL_MS,
    });
    return null;
  }
}

/**
 * 传入 512 维向量，调用 pgvector 语义搜索
 *
 * 使用 service_role 客户端调用 search_links_semantic RPC，
 * 该函数需要 SELECT 权限遍历 nav_links 表。
 */
export async function searchSemantic(
  embedding: number[],
  limit: number,
  category?: string,
  linksById?: Map<string, NavLink>
): Promise<SearchResult[]> {
  try {
    const supabase = createServiceRoleClient();
    const matchCount =
      category && category !== "all"
        ? Math.min(Math.max(limit * 10, 50), 200)
        : limit;

    const { data, error } = await supabase.rpc("search_links_semantic", {
      query_embedding: embedding,
      match_count: matchCount,
    });

    if (error) {
      logger.error("Semantic search RPC failed", { source: "api-search" }, error);
      return [];
    }

    let rows = data as unknown as SemanticRow[];

    rows = rows
      .filter((r) => !category || category === "all" || r.category_slug === category)
      .slice(0, limit);

    // Apply lightweight business signal boost:
    // featured/paid links get similarity nudged up by 0.05 (within [0,1] range).
    // click_count > 5 gets +0.02. This is applied post-query, so it doesn't
    // affect the initial pgvector ranking but boosts business-critical links
    // when they are already in the candidate set.
    rows = rows.map((r) => ({
      ...r,
      similarity: Math.min(
        1.0,
        r.similarity +
          (r.featured || r.paid ? 0.05 : 0) +
          (r.click_count > 5 ? 0.02 : 0)
      ),
    }));

    return rows
      .filter((r) => r.similarity >= MIN_SEMANTIC_SIMILARITY)
      .map((r) => {
        const link = linksById?.get(r.id);

        return {
          id: r.id,
          title: r.title,
          url: r.url,
          description: r.description ?? "",
          icon: r.icon,
          category_name: r.category_name ?? undefined,
          category_slug: r.category_slug ?? undefined,
          featured: link?.featured ?? false,
          paid: link?.paid ?? false,
          click_count: link?.click_count ?? 0,
          tags: link?.tags,
          review_count: link?.review_count,
          avg_rating: link?.avg_rating,
          similarity: r.similarity,
          source: "semantic" as const,
        };
      });
  } catch (e) {
    logger.error("Semantic search failed", { source: "api-search" }, e instanceof Error ? e : undefined);
    return [];
  }
}

export { MIN_SEMANTIC_SIMILARITY };
