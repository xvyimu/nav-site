import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { generateResourceEmbedding } from "@/lib/search/embed-provider";
import { mergeResourceHybrid } from "@/lib/resource-search-merge";
import { checkDistributedRateLimit } from "@/lib/rate-limit-distributed";
import { getClientIp } from "@/lib/utils";
import type { ResourceItem } from "@/lib/types";

const SEARCH_API =
  "https://ihnmfsfbfnctgkhxmghk.supabase.co/functions/v1/search-api-v3";
// 仅服务端密钥；禁止 NEXT_PUBLIC_* 回落（会进浏览器包）
const RESOURCE_SEARCH_API_KEY = process.env.RESOURCE_LIBRARY_API_KEY || "";
const SEARCH_TIMEOUT_MS = 8000;
const EXPECTED_EMBED_DIM = 512;
const SEARCH_CACHE_CONTROL = "no-store";
const RESOURCE_SEARCH_WINDOW_MS = 60_000;
const RESOURCE_SEARCH_MAX_PER_MIN = 30;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SearchMode = "fts" | "vector" | "hybrid";

const searchSchema = z.object({
  query: z.string().trim().min(1, "搜索词不能为空").max(200, "搜索词不能超过 200 字符"),
  mode: z.enum(["fts", "vector", "hybrid"]).default("fts"),
  limit: z.coerce.number().int().min(1).max(50).default(50),
});

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": SEARCH_CACHE_CONTROL },
  });
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string") : [];
}

function asRank(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeResource(value: unknown): ResourceItem | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = asString(row.id);
  const title = asString(row.title).replace(/\r/g, "").trim();
  const url = asString(row.url);
  const domain = asString(row.domain);
  if (!id || !title || !url || !domain) return null;

  // vector RPC returns `similarity`; FTS returns `rank`
  const rank = asRank(row.rank !== undefined ? row.rank : row.similarity);

  return {
    id,
    title,
    url,
    domain,
    summary: asString(row.summary),
    category: asString(row.category, "Other"),
    tags: asTags(row.tags),
    crawled_at: asString(row.crawled_at),
    rank,
  };
}

function extractResults(data: unknown): ResourceItem[] {
  const rawResults = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { results?: unknown }).results)
      ? (data as { results: unknown[] }).results
      : [];

  return rawResults.map(normalizeResource).filter((item): item is ResourceItem => item !== null);
}

function normalizeResponse(
  data: unknown,
  mode: SearchMode
): { results: ResourceItem[]; mode: SearchMode } {
  return {
    results: extractResults(data),
    mode,
  };
}

function isValidEmbedding(value: number[] | null): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === EXPECTED_EMBED_DIM &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

async function upstreamSearch(body: Record<string, unknown>): Promise<{
  ok: boolean;
  status: number;
  data: unknown;
}> {
  const upstream = await fetch(SEARCH_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: RESOURCE_SEARCH_API_KEY,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });

  if (!upstream.ok) {
    return { ok: false, status: upstream.status, data: null };
  }

  return { ok: true, status: upstream.status, data: await upstream.json() };
}

export async function POST(request: Request) {
  if (!RESOURCE_SEARCH_API_KEY) {
    return json({ error: "资源搜索服务未配置" }, 503);
  }

  const ip = getClientIp(request);
  const { allowed } = await checkDistributedRateLimit(
    `resource-search:${ip}`,
    RESOURCE_SEARCH_WINDOW_MS,
    RESOURCE_SEARCH_MAX_PER_MIN
  );
  if (!allowed) {
    return json({ error: "搜索过于频繁，请稍后再试" }, 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求 JSON 无效" }, 400);
  }

  const parsed = searchSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: "参数错误", details: parsed.error.flatten().fieldErrors },
      400
    );
  }

  const requestedMode = parsed.data.mode;
  const limit = parsed.data.limit;
  const query = parsed.data.query;

  let mode: SearchMode = requestedMode;
  let queryEmbedding: number[] | undefined;

  if (requestedMode === "vector" || requestedMode === "hybrid") {
    const embedding = await generateResourceEmbedding(query);
    const dim = Array.isArray(embedding) ? embedding.length : 0;
    if (!isValidEmbedding(embedding)) {
      logger.warn("Resource vector embed unavailable, falling back to FTS", {
        source: "resource-search",
        dim,
        requestedMode,
      });
      mode = "fts";
    } else {
      queryEmbedding = embedding;
    }
  }

  try {
    // pure FTS (including hybrid/vector fallback)
    if (mode === "fts" || !queryEmbedding) {
      const fts = await upstreamSearch({
        query,
        mode: "fts",
        limit,
      });
      if (!fts.ok) {
        logger.warn("Resource search upstream request failed", {
          source: "resource-search",
          status: fts.status,
          mode: "fts",
        });
        return json({ error: "资源搜索失败" }, 502);
      }
      return json(normalizeResponse(fts.data, "fts"));
    }

    // pure vector
    if (mode === "vector") {
      const vector = await upstreamSearch({
        query,
        mode: "vector",
        limit,
        query_embedding: queryEmbedding,
      });
      if (!vector.ok) {
        logger.warn("Resource search upstream request failed", {
          source: "resource-search",
          status: vector.status,
          mode: "vector",
        });
        return json({ error: "资源搜索失败" }, 502);
      }
      return json(normalizeResponse(vector.data, "vector"));
    }

    // hybrid: fetch both in parallel, RRF merge (B6)
    const fetchLimit = Math.min(50, Math.max(limit, Math.ceil(limit * 1.5)));
    const [vectorRes, ftsRes] = await Promise.all([
      upstreamSearch({
        query,
        mode: "vector",
        limit: fetchLimit,
        query_embedding: queryEmbedding,
      }),
      upstreamSearch({
        query,
        mode: "fts",
        limit: fetchLimit,
      }),
    ]);

    if (!vectorRes.ok && !ftsRes.ok) {
      logger.warn("Resource hybrid both upstreams failed", {
        source: "resource-search",
        vectorStatus: vectorRes.status,
        ftsStatus: ftsRes.status,
      });
      return json({ error: "资源搜索失败" }, 502);
    }

    const vectorItems = vectorRes.ok ? extractResults(vectorRes.data) : [];
    const ftsItems = ftsRes.ok ? extractResults(ftsRes.data) : [];

    if (vectorItems.length === 0 && ftsItems.length === 0) {
      return json({ results: [], mode: vectorRes.ok ? "hybrid" : "fts" });
    }
    if (vectorItems.length === 0) {
      return json({ results: ftsItems.slice(0, limit), mode: "fts" });
    }
    if (ftsItems.length === 0) {
      return json({ results: vectorItems.slice(0, limit), mode: "vector" });
    }

    return json({
      results: mergeResourceHybrid(vectorItems, ftsItems, limit),
      mode: "hybrid",
    });
  } catch (e) {
    logger.warn("Resource search proxy request failed", {
      source: "resource-search",
      error: e instanceof Error ? e.message : String(e),
      mode,
    });
    return json({ error: "服务器错误" }, 500);
  }
}
