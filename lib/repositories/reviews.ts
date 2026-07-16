import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { PublicToolReview, ReviewStats } from "@/lib/types";
import { checkRateLimit, cleanupOldAttempts } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { isMissingRelationError, MissingDatabaseMigrationError } from "./shared";

export { MissingDatabaseMigrationError } from "./shared";

/**
 * 获取工具的评价列表（已批准）
 */
export async function getToolReviews(linkId: string, limit = 20): Promise<PublicToolReview[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("public_tool_reviews")
    .select("id, link_id, rating, comment, approved, created_at, updated_at")
    .eq("link_id", linkId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logger.error("Failed to fetch tool reviews", { source: "repositories", linkId }, error);
    return [];
  }

  return data ?? [];
}

/**
 * 获取工具的评分统计
 */
export async function getReviewStats(linkId: string): Promise<ReviewStats | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tool_review_stats")
    .select("*")
    .eq("link_id", linkId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as ReviewStats;
}

/**
 * 检查 IP 是否已评价过某工具
 */
export async function hasUserReviewed(linkId: string, ip: string): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("tool_reviews")
    .select("id")
    .eq("link_id", linkId)
    .eq("ip", ip)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) {
      throw new MissingDatabaseMigrationError("reviews", { cause: error });
    }
    logger.warn("Failed to check existing review", {
      source: "repositories",
      linkId,
      error: error.message,
    });
    // fail-close：查重失败视为「不可提交」，由路由返回 503
    throw new Error("review_duplicate_check_failed");
  }

  return !!data;
}

/**
 * 创建工具评价
 */
export async function createReview(
  linkId: string,
  ip: string,
  rating: number,
  comment: string | null
): Promise<PublicToolReview | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("tool_reviews")
    .insert({
      link_id: linkId,
      ip,
      rating,
      comment: comment || null,
      // 默认进入审核队列，避免垃圾评价即时上架
      approved: false,
    })
    .select("id, link_id, rating, comment, approved, created_at, updated_at")
    .single();

  if (error) {
    if (isMissingRelationError(error)) {
      throw new MissingDatabaseMigrationError("reviews", { cause: error });
    }
    // 23505 unique (link_id, ip)
    if (error.code === "23505") {
      throw new Error("review_duplicate");
    }
    logger.error("Failed to create review", { source: "repositories", linkId }, error);
    throw new Error("Failed to create review");
  }

  return data;
}

/**
 * 评价速率限制检查（每 IP 每 15 分钟最多 3 条评价）
 */
export async function checkReviewRateLimit(ip: string): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { allowed } = await checkRateLimit(
    "review_rate_limits",
    ip,
    15 * 60 * 1000,
    3,
    true,
    supabase
  );
  return allowed;
}

/**
 * 记录评价速率限制
 */
export async function recordReviewAttempt(ip: string, linkId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  await cleanupOldAttempts(supabase, "review_rate_limits");
  const { error } = await supabase.from("review_rate_limits").insert({ ip, link_id: linkId });
  if (error) {
    logger.warn("Review attempt record failed", { linkId, error: error.message });
  }
}
