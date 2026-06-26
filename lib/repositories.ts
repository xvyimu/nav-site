import { createClient } from "@/lib/supabase/server";
import type { Category, NavLink, Tag, ToolReview, ReviewStats } from "@/lib/types";
import { slugify } from "@/lib/slugify";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { cache } from "react";

/**
 * 数据获取层 — 封装所有 Supabase 查询
 *
 * 页面组件和 API 路由通过此层访问数据，不直接调用 Supabase。
 * 当数据源变更时只需修改此文件。
 */

/** Supabase 客户端类型（与 createClient / createStaticClient 返回类型一致） */
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Supabase 链接行（含 join 字段）的松散类型。
 * 生成类型可能不包含 nav_links_tags join，故用此辅助类型安全访问。
 */
interface RawLinkRow {
  nav_categories?: { name: string; slug: string } | null;
  nav_links_tags?: Array<{ tags: Tag | null }> | null;
  updated_at?: string | null;
  created_at: string;
  [key: string]: unknown;
}

/** 将 Supabase 返回的链接行映射为 NavLink（含分类名与标签） */
function mapLinkRow(l: RawLinkRow): NavLink {
  return {
    ...(l as unknown as NavLink),
    category_name: l.nav_categories?.name,
    category_slug: l.nav_categories?.slug,
    updated_at: l.updated_at ?? l.created_at,
    tags: (l.nav_links_tags ?? [])
      .map((nt) => nt.tags)
      .filter((t): t is Tag => t !== null),
  };
}

// ── 分类 ──

async function getCategoriesImpl(client?: SupabaseServerClient): Promise<Category[]> {
  const supabase = client ?? await createClient();
  const { data, error } = await supabase
    .from("nav_categories")
    .select("*")
    .order("sort_order");

  if (error) {
    logger.error("Failed to fetch categories", { source: "repositories" }, error);
    throw new Error("Failed to fetch categories");
  }

  return data ?? [];
}

export const getCategories = cache(getCategoriesImpl);

// ── 链接 ──

interface GetApprovedLinksOpts {
  limit?: number;
  offset?: number;
}

/**
 * 获取所有已批准链接
 * @param options.limit - 可选，限制返回数量
 * @param options.offset - 可选，分页偏移量
 */
async function getApprovedLinksImpl(options?: GetApprovedLinksOpts): Promise<NavLink[]> {
  const supabase = await createClient();
  let query = supabase
    .from("nav_links")
    .select("*, nav_categories(name, slug), nav_links_tags(tags(id, name, slug))")
    .eq("approved", true)
    .order("featured", { ascending: false })
    .order("paid", { ascending: false })
    .order("created_at", { ascending: false });

  if (options?.limit) {
    query = query.range(
      options.offset ?? 0,
      (options.offset ?? 0) + options.limit - 1
    );
  }

  const { data, error } = await query;

  if (error) {
    logger.error("Failed to fetch links", { source: "repositories" }, error);
    throw new Error("Failed to fetch links");
  }

  return (data ?? []).map(mapLinkRow);
}

export const getApprovedLinks = cache(getApprovedLinksImpl);

// ── 工具详情页（程序化 SEO）──

/**
 * 根据 slug 获取已批准的链接（用于 /tool/[slug] 页面）
 *
 * 优先使用数据库 slug 列查询（O(1) 索引查找），
 * 如果 slug 列不存在则回退到全表扫描 + 应用层匹配。
 */
async function getApprovedLinkBySlugImpl(slug: string): Promise<NavLink | null> {
  const supabase = await createClient();

  // 优先尝试通过 slug 列直接查询（需要 migration-slug.sql 已执行）
  const { data: bySlug, error: slugErr } = await supabase
    .from("nav_links")
    .select("*, nav_categories(name, slug), nav_links_tags(tags(id, name, slug))")
    .eq("approved", true)
    .eq("slug", slug)
    .maybeSingle();

  if (!slugErr && bySlug) {
    return mapLinkRow(bySlug);
  }

  // 回退：全表扫描 + 应用层匹配（兼容未执行迁移的情况）
  const { data, error } = await supabase
    .from("nav_links")
    .select("*, nav_categories(name, slug), nav_links_tags(tags(id, name, slug))")
    .eq("approved", true);

  if (error) {
    logger.error("Failed to fetch link by slug", { source: "repositories", slug }, error);
    return null;
  }

  const link = (data ?? []).find((l) => slugify(l.title) === slug);
  if (!link) return null;

  return mapLinkRow(link);
}

export const getApprovedLinkBySlug = cache(getApprovedLinkBySlugImpl);

/**
 * 获取所有已批准链接的 slug 列表（用于 generateStaticParams / sitemap）
 *
 * 优先使用数据库 slug 列，回退到应用层 slugify。
 */
async function getAllApprovedLinkSlugsImpl(client?: SupabaseServerClient): Promise<string[]> {
  const supabase = client ?? await createClient();

  // 优先尝试读取 slug 列
  const { data, error } = await supabase
    .from("nav_links")
    .select("slug, title")
    .eq("approved", true);

  if (error) {
    logger.error("Failed to fetch link slugs", { source: "repositories" }, error);
    return [];
  }

  return (data ?? [])
    .map((l) => l.slug || slugify(l.title))
    .filter(Boolean);
}

export const getAllApprovedLinkSlugs = cache(getAllApprovedLinkSlugsImpl);

/**
 * 获取同分类的相关工具（用于工具详情页的"相关推荐"）
 *
 * 优化：直接按 category_id 查询，避免全表扫描
 */
async function getRelatedLinksImpl(
  categoryId: string | null,
  excludeUrl: string,
  limit = 6
): Promise<NavLink[]> {
  if (!categoryId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("nav_links")
    .select("*, nav_categories(name, slug), nav_links_tags(tags(id, name, slug))")
    .eq("approved", true)
    .eq("category_id", categoryId)
    .neq("url", excludeUrl)
    .order("click_count", { ascending: false })
    .limit(limit);

  if (error) {
    logger.error("Failed to fetch related links", { source: "repositories" }, error);
    return [];
  }

  return (data ?? []).map(mapLinkRow);
}

export const getRelatedLinks = cache(getRelatedLinksImpl);

/**
 * 获取所有已批准链接（用于 Agent API 端点）
 * 支持分类过滤
 *
 * 优化：直接按 category_slug 查询
 */
export async function getApprovedLinksForApi(categorySlug?: string): Promise<NavLink[]> {
  const supabase = await createClient();

  if (categorySlug && categorySlug !== "all") {
    // 通过 join 的 nav_categories.slug 过滤
    const { data, error } = await supabase
      .from("nav_links")
      .select("*, nav_categories(name, slug), nav_links_tags(tags(id, name, slug))")
      .eq("approved", true)
      .eq("nav_categories.slug", categorySlug)
      .order("featured", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Failed to fetch links for API", { source: "repositories", categorySlug }, error);
      return [];
    }

    return (data ?? []).map(mapLinkRow);
  }

  return getApprovedLinks();
}

// ── 工具评价 ──

/**
 * 获取工具的评价列表（已批准）
 */
export async function getToolReviews(linkId: string, limit = 20): Promise<ToolReview[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tool_reviews")
    .select("*")
    .eq("link_id", linkId)
    .eq("approved", true)
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
  const supabase = await createClient();
  const { data } = await supabase
    .from("tool_reviews")
    .select("id")
    .eq("link_id", linkId)
    .eq("ip", ip)
    .maybeSingle();

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
): Promise<ToolReview | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tool_reviews")
    .insert({
      link_id: linkId,
      ip,
      rating,
      comment: comment || null,
      approved: true,
    })
    .select("*")
    .single();

  if (error) {
    logger.error("Failed to create review", { source: "repositories", linkId }, error);
    throw new Error("Failed to create review");
  }

  return data;
}

/**
 * 评价速率限制检查（每 IP 每 15 分钟最多 3 条评价）
 */
export async function checkReviewRateLimit(ip: string): Promise<boolean> {
  const { allowed } = await checkRateLimit("review_rate_limits", ip, 15 * 60 * 1000, 3);
  return allowed;
}

/**
 * 记录评价速率限制
 */
export async function recordReviewAttempt(ip: string, linkId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("review_rate_limits").insert({ ip, link_id: linkId });
  if (error) {
    logger.warn("Review attempt record failed", { ip, linkId, error: error.message });
  }
}

// ── Admin: 链接管理 ──

/**
 * 获取所有链接（含未批准，供 admin 管理）
 */
export async function getAllLinksForAdmin(): Promise<NavLink[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("nav_links")
    .select("*, nav_categories(name, slug), nav_links_tags(tags(id, name, slug))")
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("Admin: Failed to fetch all links", { source: "repositories" }, error);
    throw new Error("Failed to fetch links");
  }

  return (data ?? []).map(mapLinkRow);
}

/**
 * 同步链接与标签的关联（删除现有，插入新的）
 * 用于 createLink / updateLink 时同步标签关联表
 */
async function syncLinkTags(
  supabase: SupabaseServerClient,
  linkId: string,
  tagIds: string[]
): Promise<void> {
  // 删除现有关联
  const { error: delErr } = await supabase
    .from("nav_links_tags")
    .delete()
    .eq("link_id", linkId);
  if (delErr) {
    logger.error("Failed to clear link tags", { source: "repositories", linkId }, delErr);
    throw new Error("Failed to sync link tags");
  }

  // 空数组：仅清除，不插入
  if (tagIds.length === 0) return;

  const rows = tagIds.map((tag_id) => ({ link_id: linkId, tag_id }));
  const { error: insErr } = await supabase.from("nav_links_tags").insert(rows);
  if (insErr) {
    logger.error(
      "Failed to insert link tags",
      { source: "repositories", linkId, count: tagIds.length },
      insErr
    );
    throw new Error("Failed to sync link tags");
  }
}

/**
 * 重新获取链接行（含 join），用于 createLink/updateLink 后返回完整数据
 */
async function fetchLinkWithTags(
  supabase: SupabaseServerClient,
  id: string
): Promise<NavLink> {
  const { data, error } = await supabase
    .from("nav_links")
    .select("*, nav_categories(name, slug), nav_links_tags(tags(id, name, slug))")
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
 * 创建链接（admin）
 */
export async function createLink(input: {
  title: string;
  url: string;
  description: string | null;
  icon: string;
  category_id: string | null;
  approved: boolean;
  featured: boolean;
  tag_ids?: string[];
}): Promise<NavLink> {
  const supabase = await createClient();
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

  // 同步标签关联（仅当传入 tag_ids 时）
  if (input.tag_ids && input.tag_ids.length > 0) {
    await syncLinkTags(supabase, data.id, input.tag_ids);
  }

  return fetchLinkWithTags(supabase, data.id);
}

/**
 * 更新链接（admin）
 *
 * input 中的 tag_ids 字段会被剥离并单独同步到 nav_links_tags 表：
 * - undefined：不修改标签关联
 * - []：清除所有标签关联
 * - ['id1', 'id2']：同步为这些标签
 */
export async function updateLink(id: string, input: Record<string, unknown>): Promise<NavLink> {
  const supabase = await createClient();

  // 拆分 tag_ids（不写入 nav_links 表）
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

  // 同步标签关联（仅当 tag_ids 字段被显式提供时）
  if (tag_ids !== undefined) {
    await syncLinkTags(supabase, id, tag_ids);
  }

  return fetchLinkWithTags(supabase, id);
}

/**
 * 删除链接（admin）
 */
export async function deleteLink(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("nav_links").delete().eq("id", id);
  if (error) {
    logger.error("Admin: Failed to delete link", { source: "repositories", id }, error);
    throw new Error("Failed to delete link");
  }
}

// ── Admin: 分类管理 ──

/**
 * 获取所有分类（供 admin 管理）
 */
export async function getAllCategoriesForAdmin(): Promise<Category[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("nav_categories")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    logger.error("Admin: Failed to fetch all categories", { source: "repositories" }, error);
    throw new Error("Failed to fetch categories");
  }

  return data ?? [];
}

/**
 * 创建分类（admin）
 *
 * parent_id 为可选字段：NULL = 顶级分类，非 NULL = 子分类
 */
export async function createCategory(input: {
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  sort_order: number;
  parent_id?: string | null;
}): Promise<Category> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("nav_categories")
    .insert({
      name: input.name,
      slug: input.slug,
      description: input.description,
      icon: input.icon,
      sort_order: input.sort_order,
      parent_id: input.parent_id ?? null,
    })
    .select()
    .single();

  if (error) {
    logger.error("Admin: Failed to create category", { source: "repositories", slug: input.slug }, error);
    throw new Error("Failed to create category");
  }

  return data;
}

/**
 * 更新分类（admin）
 */
export async function updateCategory(id: string, input: Record<string, unknown>): Promise<Category> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("nav_categories")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    logger.error("Admin: Failed to update category", { source: "repositories", id }, error);
    throw new Error("Failed to update category");
  }

  return data;
}

/**
 * 删除分类（admin）
 */
export async function deleteCategory(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("nav_categories").delete().eq("id", id);
  if (error) {
    logger.error("Admin: Failed to delete category", { source: "repositories", id }, error);
    throw new Error("Failed to delete category");
  }
}

// ── Admin: 标签管理 ──

/**
 * 获取所有标签（供 admin 管理）
 */
export async function getAllTagsForAdmin(): Promise<Tag[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    logger.error("Admin: Failed to fetch all tags", { source: "repositories" }, error);
    throw new Error("Failed to fetch tags");
  }

  return data ?? [];
}

/**
 * 创建标签（admin）
 */
export async function createTag(input: { name: string; slug: string }): Promise<Tag> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tags")
    .insert({ name: input.name, slug: input.slug })
    .select()
    .single();

  if (error) {
    logger.error("Admin: Failed to create tag", { source: "repositories", slug: input.slug }, error);
    throw new Error("Failed to create tag");
  }

  return data;
}

/**
 * 更新标签（admin）
 */
export async function updateTag(
  id: string,
  input: { name?: string; slug?: string }
): Promise<Tag> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tags")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    logger.error("Admin: Failed to update tag", { source: "repositories", id }, error);
    throw new Error("Failed to update tag");
  }

  return data;
}

/**
 * 删除标签（admin）
 * 关联表 nav_links_tags 通过 ON DELETE CASCADE 自动清理
 */
export async function deleteTag(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("tags").delete().eq("id", id);
  if (error) {
    logger.error("Admin: Failed to delete tag", { source: "repositories", id }, error);
    throw new Error("Failed to delete tag");
  }
}

// ── 提交与点击 ──

/**
 * 检查 URL 是否已存在（供提交去重）
 */
export async function findExistingLinkByUrl(url: string): Promise<{ id: string; approved: boolean } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("nav_links")
    .select("id, approved")
    .eq("url", url)
    .maybeSingle();

  return data ?? null;
}

/**
 * 提交新链接（待审核）
 */
export async function submitLink(input: {
  title: string;
  url: string;
  description: string | null;
  category_id: string | null;
}): Promise<boolean> {
  const supabase = await createClient();
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
    logger.error("Submit: Failed to insert link", { source: "repositories", url: input.url }, error);
    return false;
  }

  return true;
}

/**
 * 验证链接是否存在且已批准（供点击计数使用）
 */
export async function findApprovedLinkByUrl(url: string): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("nav_links")
    .select("id")
    .eq("url", url)
    .eq("approved", true)
    .maybeSingle();

  return data ?? null;
}
