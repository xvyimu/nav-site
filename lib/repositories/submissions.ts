import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * 检查 URL 是否已存在（供提交去重）。
 *
 * 使用 service_role：anon RLS 通常只能看 approved=true，看不到 pending，
 * 会导致重复提交与 409 逻辑失效。
 */
export async function findExistingLinkByUrl(url: string): Promise<{ id: string; approved: boolean } | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("nav_links")
    .select("id, approved")
    .eq("url", url)
    .maybeSingle();

  if (error) {
    logger.warn("findExistingLinkByUrl failed", { url, error: error.message });
    return null;
  }

  return data ?? null;
}

/**
 * 提交新链接（待审核）。
 *
 * service_role 写入 + 强制 approved=false，避免依赖 anon INSERT 策略。
 * 唯一约束冲突（23505）由调用方按 409 处理。
 */
export async function submitLink(input: {
  title: string;
  url: string;
  description: string | null;
  category_id: string | null;
}): Promise<{ ok: true } | { ok: false; duplicate?: boolean }> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("nav_links").insert({
    title: input.title,
    url: input.url,
    description: input.description,
    category_id: input.category_id,
    approved: false,
    paid: false,
    featured: false,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, duplicate: true };
    }
    logger.error("Submit: Failed to insert link", { source: "repositories", url: input.url }, error);
    return { ok: false };
  }

  return { ok: true };
}

/**
 * 验证链接是否存在且已批准（供点击计数使用）。
 */
export async function findApprovedLinkByUrl(url: string): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("nav_links")
    .select("id")
    .eq("url", url)
    .eq("approved", true)
    .maybeSingle();

  if (error) {
    logger.warn("findApprovedLinkByUrl query failed", { url, error: error.message });
    return null;
  }
  return data ?? null;
}
