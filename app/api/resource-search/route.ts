import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getEmbedding } from "@/lib/search/semantic";
import type { ResourceItem } from "@/lib/types";

const SEARCH_API =
  "https://ihnmfsfbfnctgkhxmghk.supabase.co/functions/v1/search-api-v3";
const RESOURCE_SEARCH_API_KEY =
  process.env.RESOURCE_LIBRARY_API_KEY ||
  process.env.NEXT_PUBLIC_RESOURCE_LIBRARY_API_KEY ||
  "";
const SEARCH_TIMEOUT_MS = 8000;
const EXPECTED_EMBED_DIM = 512;
const SEARCH_CACHE_CONTROL = "no-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const searchSchema = z.object({
  query: z.string().trim().min(1, "搜索词不能为空").max(200, "搜索词不能超过 200 字符"),
  mode: z.enum(["fts", "vector"]).default("fts"),
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

function normalizeResponse(
  data: unknown,
  mode: "fts" | "vector"
): { results: ResourceItem[]; mode: "fts" | "vector" } {
  const rawResults = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { results?: unknown }).results)
      ? (data as { results: unknown[] }).results
      : [];

  return {
    results: rawResults.map(normalizeResource).filter((item): item is ResourceItem => item !== null),
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

export async function POST(request: Request) {
  if (!RESOURCE_SEARCH_API_KEY) {
    return json({ error: "资源搜索服务未配置" }, 503);
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

  let mode: "fts" | "vector" = parsed.data.mode;
  let queryEmbedding: number[] | undefined;

  if (mode === "vector") {
    const embedding = await getEmbedding(parsed.data.query);
    const dim = Array.isArray(embedding) ? embedding.length : 0;
    if (!isValidEmbedding(embedding)) {
      logger.warn("Resource vector embed unavailable, falling back to FTS", {
        source: "resource-search",
        dim,
      });
      mode = "fts";
    } else {
      queryEmbedding = embedding;
    }
  }

  const upstreamBody =
    mode === "vector" && queryEmbedding
      ? {
          query: parsed.data.query,
          mode: "vector" as const,
          limit: parsed.data.limit,
          query_embedding: queryEmbedding,
        }
      : {
          query: parsed.data.query,
          mode: "fts" as const,
          limit: parsed.data.limit,
        };

  try {
    const upstream = await fetch(SEARCH_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: RESOURCE_SEARCH_API_KEY,
      },
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });

    if (!upstream.ok) {
      logger.warn("Resource search upstream request failed", {
        source: "resource-search",
        status: upstream.status,
        mode,
      });
      return json({ error: "资源搜索失败" }, 502);
    }

    const data = await upstream.json();
    return json(normalizeResponse(data, mode));
  } catch (e) {
    logger.warn("Resource search proxy request failed", {
      source: "resource-search",
      error: e instanceof Error ? e.message : String(e),
      mode,
    });
    return json({ error: "服务器错误" }, 500);
  }
}
