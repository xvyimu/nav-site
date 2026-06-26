import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  getToolReviews,
  getReviewStats,
  hasUserReviewed,
  createReview,
  checkReviewRateLimit,
  recordReviewAttempt,
} from "@/lib/repositories";

const reviewSchema = z.object({
  link_id: z.string().uuid("工具 ID 格式不正确"),
  rating: z.number().int().min(1, "评分最低 1 星").max(5, "评分最高 5 星"),
  comment: z.string().max(500, "评论不能超过 500 字符").nullish().default(null),
});

/**
 * 获取工具评价
 * GET /api/reviews?link_id=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get("link_id");

    if (!linkId) {
      return NextResponse.json(
        { error: "缺少 link_id 参数" },
        { status: 400 }
      );
    }

    const [reviews, stats] = await Promise.all([
      getToolReviews(linkId),
      getReviewStats(linkId),
    ]);

    return NextResponse.json({
      reviews,
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
    const ip =
      request.headers.get("x-nf-client-connection-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";

    // 速率限制
    const allowed = await checkReviewRateLimit(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: "评价过于频繁，请 15 分钟后再试" },
        { status: 429 }
      );
    }

    const body = await request.json();
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

    return NextResponse.json({ success: true, review });
  } catch (e) {
    logger.error("Reviews POST error", { source: "api-reviews" }, e instanceof Error ? e : undefined);
    return NextResponse.json(
      { error: "提交评价失败" },
      { status: 500 }
    );
  }
}
