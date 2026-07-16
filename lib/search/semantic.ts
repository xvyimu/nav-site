import { createServiceRoleClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import {
  generateEmbedding,
  getEmbeddingCacheEndpoint,
  resolveEmbedProvider,
  resolveExpectedDim,
} from "./embed-provider";
import type { NavLink } from "@/lib/types";
import type { SearchResult, SemanticRow } from "./types";

/**
 * 嵌入向量 + pgvector 语义搜索
 *
 * 这里隔离了两件外部依赖：
 * 1. 嵌入后端（EMBED_PROVIDER：cloudflare Workers AI 1024-d 常开 / embed-server 512-d 本机）；
 * 2. Supabase 的语义 RPC（service_role 客户端调用；名称由 EMBED_SEMANTIC_RPC 决定）。
 *
 * 任意一处失败都返回空数组，让上层降级为纯 Fuse 排序，
 * 不会把 5xx 抛到路由层。
 */

const MIN_SEMANTIC_SIMILARITY = 0.35;
const EMBED_UNAVAILABLE_TTL_MS = 30_000;
const EMBED_WARNING_THROTTLE_MS = 60_000;

/** 默认 512-d embed-server RPC；切到 Cloudflare 1024-d 时设 EMBED_SEMANTIC_RPC=search_links_semantic_v2 */
const DEFAULT_SEMANTIC_RPC = "search_links_semantic";

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

function getSemanticRpcName(): string {
  const configured = process.env.EMBED_SEMANTIC_RPC?.trim();
  if (configured) return configured;
  return resolveEmbedProvider() === "cloudflare"
    ? "search_links_semantic_v2"
    : DEFAULT_SEMANTIC_RPC;
}

/**
 * 生成查询向量（nav 语义搜索）。
 *
 * 后端由 EMBED_PROVIDER 决定：
 * - cloudflare → Workers AI @cf/baai/bge-m3（1024-d，常开无本机依赖）
 * - embed-server（默认）→ 本机 / Worker 反代 512-d BGE
 *
 * 保留 30s「临时不可用」缓存以避免打爆下游；provider 失败即返回 null。
 *
 * @returns 归一化向量数组（维度取决于 provider），失败时返回 null
 */
export async function getEmbedding(text: string): Promise<number[] | null> {
  const provider = resolveEmbedProvider();
  const cacheEndpoint = getEmbeddingCacheEndpoint();

  if (cacheEndpoint && isTemporarilyUnavailable(cacheEndpoint)) return null;

  try {
    const { vector, endpoint } = await generateEmbedding(text);
    const cacheKey = endpoint ?? cacheEndpoint;

    const expectedDim = resolveExpectedDim();
    const validVector =
      Array.isArray(vector) &&
      vector.length === expectedDim &&
      vector.every((value) => typeof value === "number" && Number.isFinite(value));

    if (!validVector) {
      if (cacheKey) {
        markTemporarilyUnavailable(cacheKey);
        warnThrottled(`embed:${cacheKey}:payload`, "Embed backend returned no vector", {
          source: "api-search",
          provider,
          expectedDim,
          actualDim: Array.isArray(vector) ? vector.length : 0,
          retryAfterMs: EMBED_UNAVAILABLE_TTL_MS,
        });
      }
      return null;
    }

    if (cacheKey) clearTemporarilyUnavailable(cacheKey);
    return vector;
  } catch (e) {
    if (cacheEndpoint) markTemporarilyUnavailable(cacheEndpoint);
    warnThrottled(
      `embed:${provider}:request`,
      provider === "embed-server" ? "Embed server request failed" : "Embed backend request failed",
      {
        source: "api-search",
        provider,
        error: e instanceof Error ? e.message : String(e),
        retryAfterMs: EMBED_UNAVAILABLE_TTL_MS,
      }
    );
    return null;
  }
}

/**
 * 传入 provider 对应维度向量，调用 pgvector 语义搜索
 *
 * 使用 service_role 客户端调用 EMBED_SEMANTIC_RPC 指向的 RPC，
 * 默认 search_links_semantic；Cloudflare 1024-d 使用 search_links_semantic_v2。
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

    const { data, error } = await supabase.rpc(getSemanticRpcName(), {
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
