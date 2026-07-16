import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import {
  mapLinkRow,
  PUBLIC_LINK_SELECT,
  type RawLinkRow,
} from "@/lib/repositories/shared";
import type { NavLink } from "@/lib/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// 用户收藏（user_favorites）─────────────────────────────────────────
//
// 注意：user_favorites 表启用了 RLS，策略基于 Supabase Auth JWT 的 `sub`。
// 但本项目认证用 NextAuth（非 Supabase Auth），cookie 里没有 Supabase JWT，
// `auth.jwt() ->> 'sub'` 恒为 null → RLS 策略会拒绝所有读写。
// 因此收藏操作走 service_role 客户端绕过 RLS，在应用层用 session.user.id 做权限隔离。
// 这与 admin/submit/click 的模式一致。

/** 获取指定用户的收藏 link_id 列表 */
export async function getUserFavorites(userId: string): Promise<string[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("user_favorites")
    .select("link_id")
    .eq("user_id", userId);

  if (error) {
    logger.error("getUserFavorites failed", { source: "repositories", userId }, error);
    return [];
  }
  return (data ?? []).map((r) => r.link_id as string);
}

/**
 * 获取当前用户收藏对应的公开链接投影（NavLink 形）。
 * 仅返回 approved 链接；已下架的收藏 id 会被静默跳过。
 */
export async function getUserFavoriteLinks(userId: string): Promise<NavLink[]> {
  const linkIds = await getUserFavorites(userId);
  if (linkIds.length === 0) return [];

  const ids = linkIds.slice(0, 200);
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("nav_links")
    .select(PUBLIC_LINK_SELECT)
    .eq("approved", true)
    .in("id", ids);

  if (error) {
    logger.error("getUserFavoriteLinks failed", { source: "repositories", userId }, error);
    return [];
  }

  const byId = new Map(
    ((data ?? []) as unknown as RawLinkRow[]).map((row) => {
      const link = mapLinkRow(row);
      return [link.id, link] as const;
    })
  );

  return ids.map((id) => byId.get(id)).filter((link): link is NavLink => Boolean(link));
}

/** 批量添加收藏（去重） */
export async function addUserFavorites(
  supabase: SupabaseServerClient,
  userId: string,
  linkIds: string[]
): Promise<{ added: number } | { error: string }> {
  const rows = linkIds.map((link_id) => ({ user_id: userId, link_id }));
  const { data, error } = await supabase
    .from("user_favorites")
    .upsert(rows, { onConflict: "user_id,link_id", ignoreDuplicates: true })
    .select("link_id");

  if (error) {
    logger.error("addUserFavorites failed", { source: "repositories", userId, count: linkIds.length }, error);
    return { error: "添加收藏失败" };
  }
  return { added: data?.length ?? 0 };
}

/** 删除单条收藏 */
export async function removeUserFavorite(
  userId: string,
  linkId: string
): Promise<{ ok: true } | { error: string }> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("user_favorites")
    .delete()
    .eq("user_id", userId)
    .eq("link_id", linkId);

  if (error) {
    logger.error("removeUserFavorite failed", { source: "repositories", userId, linkId }, error);
    return { error: "删除收藏失败" };
  }
  return { ok: true };
}

/** 清空用户所有收藏 */
export async function clearUserFavorites(
  userId: string
): Promise<{ ok: true; cleared: true } | { error: string }> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("user_favorites")
    .delete()
    .eq("user_id", userId);

  if (error) {
    logger.error("clearUserFavorites failed", { source: "repositories", userId }, error);
    return { error: "清空收藏失败" };
  }
  return { ok: true, cleared: true };
}
