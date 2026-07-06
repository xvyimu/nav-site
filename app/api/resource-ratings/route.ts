import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/utils";
import { z } from "zod";
import {
  createResourceLibraryPublicRatingStatsClient,
  createResourceLibraryServiceClient,
} from "@/lib/resource-library/client";

// 资源库评分提交 API
// 数据写入 rl Supabase 项目（ihnmfsfbfnctgkhxmghk）的 ratings 表
// 走 nav-site 自有 service_role 连接，绕过 rl 项目的 RLS

const RATING_TIMEOUT_MS = 5000;
const RATING_STATS_CACHE_CONTROL =
  "public, max-age=30, s-maxage=60, stale-while-revalidate=300";

export const dynamic = "force-dynamic";

const ratingSchema = z.object({
  page_id: z.string().uuid("资源 ID 格式不正确"),
  query_text: z.string().max(200, "搜索词不能超过 200 字符").optional().default(""),
  rating: z.number().int().min(1, "评分最低 1 星").max(5, "评分最高 5 星"),
});

const ratingStatsSchema = z.object({
  page_id: z.string().uuid("资源 ID 格式不正确"),
});

function parseRatingCount(data: unknown): number {
  if (typeof data === "number" && Number.isFinite(data)) return data;
  if (data && typeof data === "object") {
    const count = (data as { count?: unknown }).count;
    if (typeof count === "number" && Number.isFinite(count)) return count;
  }
  return 0;
}

function ratingStatsResponse(count: number) {
  return NextResponse.json(
    { count },
    { headers: { "Cache-Control": RATING_STATS_CACHE_CONTROL } }
  );
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "请求 JSON 无效" }, { status: 400 });
    }

    const parsed = ratingSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      return NextResponse.json(
        { error: "输入验证失败", details: errors },
        { status: 400 }
      );
    }

    const { page_id, query_text, rating } = parsed.data;
    const ip = getClientIp(request);
    const supabase = createResourceLibraryServiceClient();
    if (!supabase) {
      logger.error("RESOURCE_LIBRARY_SERVICE_ROLE_KEY not configured", {
        source: "resource-ratings",
      });
      return NextResponse.json({ error: "评分服务未配置" }, { status: 503 });
    }

    // ── 速率限制：每 IP 每 15 分钟最多 10 次评分 ──
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count, error: rateLimitErr } = await supabase
      .from("ratings")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", since)
      .abortSignal(AbortSignal.timeout(RATING_TIMEOUT_MS));
    if (rateLimitErr) {
      logger.warn("Resource ratings rate-limit check failed", {
        source: "resource-ratings",
        error: rateLimitErr.message,
      });
    }
    if ((count ?? 0) >= 10) {
      return NextResponse.json(
        { error: "评分过于频繁，请 15 分钟后再试" },
        { status: 429 }
      );
    }

    // 校验 pages 表中确实存在该 page_id
    const { data: page, error: pageErr } = await supabase
      .from("pages")
      .select("id")
      .eq("id", page_id)
      .abortSignal(AbortSignal.timeout(RATING_TIMEOUT_MS))
      .maybeSingle();
    if (pageErr || !page) {
      return NextResponse.json(
        { error: "资源不存在" },
        { status: 404 }
      );
    }

    const { error } = await supabase
      .from("ratings")
      .insert({
        page_id,
        query_text,
        rating,
        ip,
      })
      .abortSignal(AbortSignal.timeout(RATING_TIMEOUT_MS));

    if (error) {
      logger.error("Failed to insert rating", { source: "resource-ratings", error: error.message });
      return NextResponse.json({ error: "提交评分失败" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    logger.error("Resource ratings POST error", { source: "resource-ratings" }, e instanceof Error ? e : undefined);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

/**
 * 获取某资源的评分统计
 * GET /api/resource-ratings?page_id=xxx
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = ratingStatsSchema.safeParse({
      page_id: searchParams.get("page_id") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数错误", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { page_id: pageId } = parsed.data;

    const publicStats = createResourceLibraryPublicRatingStatsClient();
    if (publicStats) {
      try {
        const { data, error } = await publicStats.client
          .rpc(publicStats.rpcName, { target_page_id: pageId })
          .abortSignal(AbortSignal.timeout(RATING_TIMEOUT_MS));

        if (!error) {
          return ratingStatsResponse(parseRatingCount(data));
        }

        logger.warn("Resource public rating stats RPC failed", {
          source: "resource-ratings",
          code: error.code,
        });
      } catch (e) {
        logger.warn("Resource public rating stats RPC threw", {
          source: "resource-ratings",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const supabase = createResourceLibraryServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: "评分服务未配置" }, { status: 503 });
    }

    const { count, error } = await supabase
      .from("ratings")
      .select("id", { count: "exact", head: true })
      .eq("page_id", pageId)
      .abortSignal(AbortSignal.timeout(RATING_TIMEOUT_MS));

    if (error) {
      return NextResponse.json({ error: "获取评分失败" }, { status: 500 });
    }

    return ratingStatsResponse(count ?? 0);
  } catch {
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
