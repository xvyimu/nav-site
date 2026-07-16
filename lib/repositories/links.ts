import { cache } from "react";
import { createStaticClient } from "@/lib/supabase/server";
import type { NavLink } from "@/lib/types";
import { slugify } from "@/lib/slugify";
import { logger } from "@/lib/logger";
import {
  mapLinkRow,
  PUBLIC_LINK_SELECT,
  PUBLIC_LINK_SELECT_INNER_CATEGORY,
  type RawLinkRow,
  type SupabaseServerClient,
} from "./shared";
import { attachTagsToLinks } from "./tags";

interface GetApprovedLinksOpts {
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

/**
 * 获取所有已批准链接。
 */
async function getApprovedLinksImpl(options?: GetApprovedLinksOpts): Promise<NavLink[]> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (options?.signal?.aborted) {
      throw new Error("Failed to fetch links");
    }

    try {
      const supabase = createStaticClient();
      const buildQuery = (select: string) => {
        let query = supabase
          .from("nav_links")
          .select(select)
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

        if (options?.signal) {
          query = query.abortSignal(options.signal);
        }

        return query;
      };

      const { data, error } = await buildQuery(PUBLIC_LINK_SELECT);

      if (error) {
        logger.error("Failed to fetch links", { source: "repositories", attempt }, error);
        lastError = new Error("Failed to fetch links");
        if (options?.signal?.aborted) break;
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
        continue;
      }

      const result = await attachTagsToLinks(
        supabase,
        ((data ?? []) as unknown as RawLinkRow[]).map(mapLinkRow),
        options?.signal
      );

      if (result.length === 0 && attempt < 2) {
        logger.warn("getApprovedLinks returned empty", { attempt });
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      return result;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (options?.signal?.aborted) break;
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
  throw lastError ?? new Error("getApprovedLinks failed after 3 attempts");
}

export const getApprovedLinks = cache(getApprovedLinksImpl);

/**
 * 根据 slug 获取已批准的链接（用于 /tool/[slug] 页面）。
 * 仅按 DB slug 列查询，不做全表 title→slugify 扫描。
 */
async function getApprovedLinkBySlugImpl(slug: string): Promise<NavLink | null> {
  const supabase = createStaticClient();

  const { data: bySlug, error: slugErr } = await supabase
    .from("nav_links")
    .select(PUBLIC_LINK_SELECT)
    .eq("approved", true)
    .eq("slug", slug)
    .maybeSingle();

  if (slugErr) {
    logger.error("Failed to fetch link by slug", { source: "repositories", slug }, slugErr);
    return null;
  }

  if (!bySlug) return null;
  return mapLinkRow(bySlug);
}

export const getApprovedLinkBySlug = cache(getApprovedLinkBySlugImpl);

/**
 * 获取所有已批准链接的 slug 列表（用于 generateStaticParams / sitemap）。
 */
async function getAllApprovedLinkSlugsImpl(client?: SupabaseServerClient): Promise<string[]> {
  const supabase = client ?? createStaticClient();

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
 * 获取同分类的相关工具（用于工具详情页的"相关推荐"）。
 */
async function getRelatedLinksImpl(
  categoryId: string | null,
  excludeUrl: string,
  limit = 6
): Promise<NavLink[]> {
  if (!categoryId) return [];

  const supabase = createStaticClient();
  const { data, error } = await supabase
    .from("nav_links")
    .select(PUBLIC_LINK_SELECT)
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
 * 获取所有已批准链接（用于 Agent API 端点），支持分类过滤。
 */
export async function getApprovedLinksForApi(categorySlug?: string): Promise<NavLink[]> {
  const supabase = createStaticClient();

  if (categorySlug && categorySlug !== "all") {
    const { data, error } = await supabase
      .from("nav_links")
      .select(PUBLIC_LINK_SELECT_INNER_CATEGORY)
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

export interface ApprovedLinksApiQuery {
  category?: string;
  search?: string;
  ids?: string[];
  limit?: number;
}

export interface ApprovedLinksApiResult {
  links: NavLink[];
  total: number;
}

interface PublicToolRpcRow extends RawLinkRow {
  category_name?: string | null;
  category_slug?: string | null;
  total_count?: number | string | null;
}

function isMissingToolsRpc(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /list_public_tools/i.test(error.message ?? "") && /not found|does not exist/i.test(error.message ?? "")
  );
}

function mapPublicToolRpcRow(row: PublicToolRpcRow): NavLink {
  const category = row.category_name && row.category_slug
    ? { name: row.category_name, slug: row.category_slug }
    : null;
  return mapLinkRow({ ...row, nav_categories: category });
}

/**
 * Query the public tools API projection in one database call.
 *
 * `list_public_tools` applies filters, limit, and window-counting in Postgres.
 * During rolling deployment, a missing RPC falls back to the legacy read path.
 */
export async function queryApprovedLinksForApi(
  options: ApprovedLinksApiQuery = {}
): Promise<ApprovedLinksApiResult> {
  const supabase = createStaticClient();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const category = options.category && options.category !== "all" ? options.category : null;
  const search = options.search?.trim() || null;
  const ids = options.ids && options.ids.length > 0 ? options.ids : null;

  const { data, error } = await supabase.rpc("list_public_tools", {
    p_category_slug: category,
    p_ids: ids,
    p_search: search,
    p_limit: limit,
  });

  if (!error) {
    const rows = (data ?? []) as unknown as PublicToolRpcRow[];
    const totalValue = rows[0]?.total_count ?? 0;
    const total = Number(totalValue);
    return {
      links: rows.map(mapPublicToolRpcRow),
      total: Number.isFinite(total) ? total : 0,
    };
  }

  if (!isMissingToolsRpc(error)) {
    logger.error("Failed to query links for tools API", { source: "repositories" }, error);
    return { links: [], total: 0 };
  }

  logger.warn("list_public_tools RPC unavailable; using compatibility query", {
    source: "repositories",
  });
  let links = await getApprovedLinksForApi(category ?? undefined);
  if (search) {
    const normalizedSearch = search.toLowerCase();
    links = links.filter((link) =>
      link.title.toLowerCase().includes(normalizedSearch) ||
      link.description?.toLowerCase().includes(normalizedSearch) ||
      link.category_name?.toLowerCase().includes(normalizedSearch)
    );
  }
  if (ids) {
    const idSet = new Set(ids);
    links = links.filter((link) => idSet.has(link.id));
  }

  return { links: links.slice(0, limit), total: links.length };
}
