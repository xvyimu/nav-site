import type Fuse from "fuse.js";
import { getApprovedLinks } from "@/lib/repositories";
import { logger } from "@/lib/logger";
import { withTimeout } from "@/lib/utils";
import { applySearchFilters, type SearchFilters } from "@/lib/search-experience";
import type { NavLink } from "@/lib/types";
import type { FuseCache, FuseResultItem, SearchResult } from "./types";

/**
 * Fuse.js 实例与搜索池管理
 *
 * 这里把 60 秒的全量数据缓存 + 按分类/过滤条件即时构建子池 Fuse 的逻辑集中起来，
 * 路由层只需调用 `getSearchPool(category, filters)` 即可拿到一个可用于搜索的 Fuse 实例。
 */

const FETCH_TIMEOUT = 8000;
const CACHE_TTL_MS = 60_000; // 60 秒

let fuseCache: FuseCache | null = null;

function hasActiveFilters(filters?: SearchFilters): boolean {
  return Boolean(
    (filters?.category && filters.category !== "all") ||
    filters?.tagSlugs.length ||
    filters?.minRating !== null && filters?.minRating !== undefined ||
    filters?.popularity
  );
}

function createFuse(FuseModule: typeof Fuse, links: NavLink[]): Fuse<NavLink> {
  return new FuseModule(links, {
    keys: [
      { name: "title", weight: 2 },
      { name: "description", weight: 1 },
      { name: "category_name", weight: 0.8 },
    ],
    threshold: 0.4,
    distance: 100,
    minMatchCharLength: 1,
    includeScore: true,
  });
}

/**
 * 获取当前可搜索的池：返回子池 Fuse + 子池 links + 全量 links。
 *
 * - 全量 links 缓存 60 秒，避免每次请求都打 DB；
 * - 子池按 category/filters 即时构建（成本低，因为 Fuse 构造是 O(n)）。
 */
export async function getSearchPool(
  category?: string,
  filters?: SearchFilters
): Promise<{ fuse: Fuse<NavLink>; links: NavLink[]; allLinks: NavLink[] }> {
  const now = Date.now();
  const { default: FuseModule } = await import("fuse.js");
  let allLinks: NavLink[];

  // 检查缓存是否有效
  if (fuseCache && now - fuseCache.timestamp < CACHE_TTL_MS) {
    allLinks = fuseCache.links;
  } else {
    allLinks = await withTimeout(getApprovedLinks(), FETCH_TIMEOUT).catch(() => {
      logger.warn("Search API: getApprovedLinks timed out");
      return [];
    });

    fuseCache = {
      fuse: createFuse(FuseModule, allLinks),
      links: allLinks,
      timestamp: now,
    };
  }

  let pool = allLinks;
  if (category && category !== "all") {
    pool = allLinks.filter((l) => l.category_slug === category);
  }
  pool = applySearchFilters(pool, filters);

  const isFullPool = (!category || category === "all") && !hasActiveFilters(filters);

  return {
    fuse: isFullPool && fuseCache ? fuseCache.fuse : createFuse(FuseModule, pool),
    links: pool,
    allLinks,
  };
}

/**
 * 对多个 query terms 分别搜索 Fuse，按 id 去重并保留每个 id 的最佳分数，
 * 最终按 score 升序（0 最匹配）截断到 limit。
 */
export function searchFuseTerms(
  fuse: Fuse<NavLink>,
  terms: string[],
  limit: number
): FuseResultItem[] {
  const byId = new Map<string, FuseResultItem>();
  const queryTerms = terms.length > 0 ? terms : [""];

  for (const term of queryTerms) {
    if (!term) continue;
    for (const result of fuse.search(term).slice(0, limit)) {
      const existing = byId.get(result.item.id);
      if (!existing || (result.score ?? 1) < (existing.score ?? 1)) {
        byId.set(result.item.id, result);
      }
    }
  }

  return Array.from(byId.values())
    .sort((a, b) => (a.score ?? 1) - (b.score ?? 1))
    .slice(0, limit);
}

/** 把 Fuse 原始结果转换成统一 SearchResult 形态（source: "fuse"） */
export function toFuseResults(raw: FuseResultItem[], limit: number): SearchResult[] {
  return raw.slice(0, limit).map((r) => ({
    id: r.item.id,
    title: r.item.title,
    url: r.item.url,
    description: r.item.description,
    icon: r.item.icon,
    category_name: r.item.category_name,
    category_slug: r.item.category_slug,
    featured: r.item.featured,
    paid: r.item.paid,
    click_count: r.item.click_count,
    tags: r.item.tags,
    review_count: r.item.review_count,
    avg_rating: r.item.avg_rating,
    score: r.score ?? 1,
    source: "fuse" as const,
  }));
}
