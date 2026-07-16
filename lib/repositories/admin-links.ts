import type { NavLink } from "@/lib/types";
import { logger } from "@/lib/logger";
import {
  createAdminClient,
  mapLinkRow,
  PUBLIC_LINK_SELECT,
  type SupabaseDataClient,
} from "./shared";
import { syncLinkTags } from "./tags";

/**
 * 获取所有链接（含未批准，供 admin 管理）。
 */
export async function getAllLinksForAdmin(): Promise<NavLink[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("nav_links")
    .select(PUBLIC_LINK_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("Admin: Failed to fetch all links", { source: "repositories" }, error);
    throw new Error("Failed to fetch links");
  }

  return (data ?? []).map(mapLinkRow);
}

async function fetchLinkWithTags(
  supabase: SupabaseDataClient,
  id: string
): Promise<NavLink> {
  const { data, error } = await supabase
    .from("nav_links")
    .select(PUBLIC_LINK_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    logger.error(
      "Failed to refetch link with tags",
      { source: "repositories", id },
      error ?? undefined
    );
    throw new Error("Failed to fetch link");
  }

  return mapLinkRow(data);
}

/**
 * 创建链接（admin）。
 */
export async function createLink(
  input: {
    title: string;
    url: string;
    description: string | null;
    icon: string;
    category_id: string | null;
    approved: boolean;
    featured: boolean;
    tag_ids?: string[];
  }
): Promise<NavLink> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("nav_links")
    .insert({
      title: input.title,
      url: input.url,
      description: input.description,
      icon: input.icon,
      category_id: input.category_id,
      approved: input.approved,
      featured: input.featured,
    })
    .select()
    .single();

  if (error) {
    logger.error("Admin: Failed to create link", { source: "repositories", url: input.url }, error);
    throw new Error("Failed to create link");
  }

  if (input.tag_ids && input.tag_ids.length > 0) {
    await syncLinkTags(supabase, data.id, input.tag_ids);
  }

  return fetchLinkWithTags(supabase, data.id);
}

/**
 * 更新链接（admin）。
 */
export async function updateLink(id: string, input: Record<string, unknown>): Promise<NavLink> {
  const supabase = createAdminClient();
  const { tag_ids, ...linkFields } = input as { tag_ids?: string[] } & Record<string, unknown>;

  if (Object.keys(linkFields).length > 0) {
    const { error } = await supabase
      .from("nav_links")
      .update(linkFields)
      .eq("id", id);

    if (error) {
      logger.error("Admin: Failed to update link", { source: "repositories", id }, error);
      throw new Error("Failed to update link");
    }
  }

  if (tag_ids !== undefined) {
    await syncLinkTags(supabase, id, tag_ids);
  }

  return fetchLinkWithTags(supabase, id);
}

/**
 * 删除链接（admin）。
 */
export async function deleteLink(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("nav_links").delete().eq("id", id);
  if (error) {
    logger.error("Admin: Failed to delete link", { source: "repositories", id }, error);
    throw new Error("Failed to delete link");
  }
}
