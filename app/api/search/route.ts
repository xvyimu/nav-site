import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { searchQuerySchema } from "@/lib/schemas";
import { getRequestId, parseSearchParams } from "@/lib/search/params";
import { executeSearch } from "@/lib/search/use-case";
import { checkDistributedRateLimit } from "@/lib/rate-limit-distributed";
import { getClientIp } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SEARCH_WINDOW_MS = 60_000;
const SEARCH_MAX_PER_MIN = 60;
const SEMANTIC_MAX_PER_MIN = 20;

/**
 * 服务端搜索 API
 *
 * 用法：
 *   GET /api/search?q=react
 *   GET /api/search?q=react&limit=20
 *   GET /api/search?q=react&category=dev-tools
 *   GET /api/search?q=react&semantic=true
 *
 * 路由层只做：限流 → 请求 ID → 参数校验 → 用例调度 → NextResponse。
 * 搜索编排逻辑在 lib/search/use-case.ts。
 */
export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const startedAt = Date.now();

  try {
    const ip = getClientIp(request);
    const semantic = request.nextUrl.searchParams.get("semantic") === "true";
    const max = semantic ? SEMANTIC_MAX_PER_MIN : SEARCH_MAX_PER_MIN;
    const { allowed } = await checkDistributedRateLimit(
      `search:${semantic ? "sem" : "fuse"}:${ip}`,
      SEARCH_WINDOW_MS,
      max
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "搜索过于频繁，请稍后再试", results: [], total: 0 },
        {
          status: 429,
          headers: {
            "x-request-id": requestId,
            "Retry-After": "60",
          },
        }
      );
    }

    const { searchParams } = new URL(request.url);

    // Zod 查询参数校验（searchParams.get 返回 null，需转为 undefined 以适配 optional）
    const rawQuery = Object.fromEntries(
      ["q", "category", "limit", "semantic"].map(k => [k, searchParams.get(k) ?? undefined])
    );
    const zodResult = searchQuerySchema.safeParse(rawQuery);
    if (!zodResult.success) {
      const fieldErrors = zodResult.error.flatten().fieldErrors;
      const firstError = Object.values(fieldErrors).flat()[0] || "查询参数验证失败";
      return NextResponse.json(
        { error: firstError, results: [], total: 0 },
        { status: 400, headers: { "x-request-id": requestId } }
      );
    }

    const parsed = parseSearchParams(searchParams, requestId);
    if (parsed instanceof NextResponse) return parsed;

    const result = await executeSearch({ params: parsed, requestId, startedAt });
    return NextResponse.json(result.body, {
      status: result.status,
      headers: result.headers,
    });
  } catch (e) {
    logger.error(
      "Search API error",
      {
        source: "api-search",
        event: "search_request_failed",
        requestId,
        durationMs: Date.now() - startedAt,
      },
      e instanceof Error ? e : undefined
    );

    return NextResponse.json(
      { error: "Search failed", results: [], total: 0 },
      { status: 500, headers: { "x-request-id": requestId } }
    );
  }
}
