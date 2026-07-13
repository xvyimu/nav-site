import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/utils";
import { checkOrigin } from "@/lib/csrf";
import { reviewSchema, reviewsQuerySchema } from "@/lib/schemas";
import {
  getToolReviews,
  getReviewStats,
  hasUserReviewed,
  createReview,
  checkReviewRateLimit,
  recordReviewAttempt,
  MissingDatabaseMigrationError,
} from "@/lib/repositories";

/**
 * 获取工具评价
 * GET /api/reviews?link_id=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Zod 查询参数校验
    const zodResult = reviewsQuerySchema.safeParse({
      link_id: searchParams.get("link_id"),
    });
    if (!zodResult.success) {
      const fieldErrors = zodResult.error.flatten().fieldErrors;
      const firstError = Object.values(fieldErrors).flat()[0] || "缺少 link_id 参数";
      return NextResponse.json(
        { error: firstError },
        { status: 400 }
      );
    }

    const linkId = zodResult.data.link_id;

    const [reviews, stats] = await Promise.all([
      getToolReviews(linkId),
      getReviewStats(linkId),
    ]);

    return NextResponse.json({
      reviews: reviews.map(({ id, link_id, rating, comment, approved, created_at, updated_at }) => ({
        id,
        link_id,
        rating,
        comment,
        approved,
        created_at,
        updated_at,
      })),
      stats: stats ?? {
        review_count: 0,
        avg_rating: 0,
        five_star_count: 0,
        four_star_count: 0,
        three_star_count: 0,
        two_star_count: 0,
        one_star_count: 0,
      },
    }, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (e) {
    logger.error("Reviews GET error", { source: "api-reviews" }, e instanceof Error ? e : undefined);
    return NextResponse.json(
      { error: "获取评价失败" },
      { status: 500 }
    );
  }
}

/**
 * 提交工具评价
 * POST /api/reviews
 */
export async function POST(request: NextRequest) {
  try {
    const csrfError = checkOrigin(request, "api-reviews");
    if (csrfError) return csrfError;

    const ip = getClientIp(request);

    // 速率限制
    const allowed = await checkReviewRateLimit(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: "评价过于频繁，请 15 分钟后再试" },
        { status: 429 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      return NextResponse.json(
        { error: "输入验证失败", details: errors },
        { status: 400 }
      );
    }

    const { link_id, rating, comment } = parsed.data;

    // 检查是否已评价过
    const alreadyReviewed = await hasUserReviewed(link_id, ip);
    if (alreadyReviewed) {
      return NextResponse.json(
        { error: "您已经评价过这个工具" },
        { status: 409 }
      );
    }

    const review = await createReview(link_id, ip, rating, comment);
    await recordReviewAttempt(ip, link_id);

    return NextResponse.json({
      success: true,
      review,
      message: "评价已提交，审核通过后展示",
    });
  } catch (e) {
    if (e instanceof MissingDatabaseMigrationError) {
      logger.warn("Reviews POST unavailable until migration is applied", { source: "api-reviews" });
      return NextResponse.json(
        { error: "Reviews database migration has not been applied" },
        { status: 503 }
      );
    }

    if (e instanceof Error) {
      if (e.message === "review_duplicate") {
        return NextResponse.json(
          { error: "您已经评价过这个工具" },
          { status: 409 }
        );
      }
      if (e.message === "review_duplicate_check_failed") {
        return NextResponse.json(
          { error: "评价服务暂时不可用，请稍后重试" },
          { status: 503 }
        );
      }
    }

    logger.error("Reviews POST error", { source: "api-reviews" }, e instanceof Error ? e : undefined);
    return NextResponse.json(
      { error: "提交评价失败" },
      { status: 500 }
    );
  }
}
