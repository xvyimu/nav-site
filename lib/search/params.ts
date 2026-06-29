import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { PopularityFilter } from "@/lib/search-experience";
import { normalizeSearchFilters } from "@/lib/search-experience";
import type { SearchParams } from "./types";

/**
 * 搜索请求参数解析 + 校验
 *
 * 这一层负责把 URL search params 转成类型安全的 SearchParams，
 * 任何校验失败都返回 NextResponse（400）而不是抛错，
 * 让调用方可以直接 `if (parsed instanceof NextResponse) return parsed;`。
 */

export const MAX_QUERY_LENGTH = 120;
export const MAX_LIMIT = 100;
export const CATEGORY_SLUG_RE = /^[a-z0-9-]{1,50}$/;

export function badRequest(message: string, requestId?: string): NextResponse {
  return NextResponse.json(
    { error: message, results: [], total: 0 },
    {
      status: 400,
      headers: requestId ? { "x-request-id": requestId } : undefined,
    }
  );
}

export function getRequestId(request: NextRequest): string {
  return request.headers.get("x-request-id") || randomUUID();
}

export function hashQuery(q: string): string {
  return createHash("sha256").update(q).digest("hex").slice(0, 12);
}

export function searchLogContext(
  requestId: string,
  params: Pick<SearchParams, "q" | "category" | "limit" | "semantic">,
  startedAt: number,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  return {
    source: "api-search",
    event: "search_request",
    requestId,
    queryLength: params.q.length,
    queryHash: params.q ? hashQuery(params.q) : null,
    category: params.category ?? "all",
    limit: params.limit,
    requestedMode: params.semantic ? "semantic" : "fuse",
    durationMs: Date.now() - startedAt,
    ...extra,
  };
}

/**
 * 解析并校验 URL search params 为 SearchParams
 *
 * @returns SearchParams（成功）或 NextResponse（400，失败）
 */
export function parseSearchParams(
  searchParams: URLSearchParams,
  requestId?: string
): SearchParams | NextResponse {
  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (q.length > MAX_QUERY_LENGTH) {
    return badRequest(`q must be ${MAX_QUERY_LENGTH} characters or fewer`, requestId);
  }

  const category = searchParams.get("category") ?? undefined;
  if (category && category !== "all" && !CATEGORY_SLUG_RE.test(category)) {
    return badRequest("category must be a valid slug", requestId);
  }

  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return badRequest(`limit must be an integer from 1 to ${MAX_LIMIT}`, requestId);
  }

  const tagSlugs = searchParams
    .getAll("tag")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  if (tagSlugs.some((tag) => !CATEGORY_SLUG_RE.test(tag))) {
    return badRequest("tag must be a valid slug", requestId);
  }

  const minRatingParam = searchParams.get("minRating");
  const minRating = minRatingParam ? Number(minRatingParam) : null;
  if (minRating !== null && (!Number.isFinite(minRating) || minRating < 1 || minRating > 5)) {
    return badRequest("minRating must be a number from 1 to 5", requestId);
  }

  const popularityParam = searchParams.get("popularity");
  const popularity =
    popularityParam === "featured" || popularityParam === "popular"
      ? popularityParam
      : null;
  if (popularityParam && !popularity) {
    return badRequest("popularity must be featured or popular", requestId);
  }

  return {
    q,
    category,
    limit,
    semantic: searchParams.get("semantic") === "true",
    filters: normalizeSearchFilters({
      category,
      tagSlugs,
      minRating,
      popularity: popularity as PopularityFilter | null,
    }),
  };
}
