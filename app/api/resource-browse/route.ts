import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { z } from "zod";
import {
  RESOURCE_LIBRARY_SAFE_PAGE_COLUMNS,
  createResourceLibraryReadClient,
} from "@/lib/resource-library/client";

// 资源库浏览 API
// 优先用资源库 anon key 读取公开 view；未配置时才退回 service_role。
// 搜索场景走 /api/resource-search 代理；浏览（首屏、分类浏览）走本路由。

const BROWSE_TIMEOUT_MS = 5000;
const BROWSE_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

export const dynamic = "force-dynamic";

const browseSchema = z.object({
  category: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(500),
});

export async function GET(request: Request) {
  const read = createResourceLibraryReadClient();
  if (!read) {
    return NextResponse.json({ error: "资源浏览服务未配置" }, { status: 503 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const parsed = browseSchema.safeParse({
      category: searchParams.get("category") || undefined,
      limit: searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数错误", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { category, limit } = parsed.data;

    let q = read.client
      .from(read.pagesSource)
      .select(RESOURCE_LIBRARY_SAFE_PAGE_COLUMNS)
      .order("crawled_at", { ascending: false })
      .limit(limit);

    if (category) q = q.eq("category", category);

    const { data, error } = await q.abortSignal(AbortSignal.timeout(BROWSE_TIMEOUT_MS));
    if (error) {
      logger.warn("Resource browse query failed", {
        source: "resource-browse",
        code: error.code,
      });
      return NextResponse.json({ error: "读取资源失败" }, { status: 500 });
    }

    const normalized = (data ?? []).map((r: {
      id: string;
      title: string;
      url: string;
      domain: string;
      summary?: string | null;
      category?: string | null;
      tags?: string[] | null;
      crawled_at?: string | null;
    }) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      domain: r.domain,
      summary: r.summary ?? "",
      category: r.category ?? "Other",
      tags: r.tags ?? [],
      crawled_at: r.crawled_at ?? "",
      rank: 0,
    }));

    return NextResponse.json(
      { results: normalized },
      { headers: { "Cache-Control": BROWSE_CACHE_CONTROL } }
    );
  } catch (e) {
    logger.warn("Resource browse request failed", {
      source: "resource-browse",
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
