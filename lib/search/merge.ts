import { buildSearchMeta } from "@/lib/search-experience";
import type { NavLink, SearchSource } from "@/lib/types";
import type { SearchResult } from "./types";
import { MIN_SEMANTIC_SIMILARITY } from "./semantic";

/**
 * 混合排序与结果装饰
 *
 * 把 fuse / semantic 两路结果合并、按 RRF 排序、附加 searchMeta，
 * 最后转回 NavLink 形态供前端消费。
 */

/** 把统一 SearchResult 转回 NavLink（搜索专用字段保留） */
export function toNavLinkResult(result: SearchResult): NavLink {
  return {
    id: result.id,
    title: result.title,
    url: result.url,
    description: result.description,
    icon: result.icon,
    category_id: null,
    approved: true,
    paid: result.paid,
    featured: result.featured,
    click_count: result.click_count,
    created_at: "",
    category_name: result.category_name,
    category_slug: result.category_slug,
    tags: result.tags,
    review_count: result.review_count,
    avg_rating: result.avg_rating,
    score: result.score,
    similarity: result.similarity,
    searchMeta: result.searchMeta,
  };
}

/** 给结果附加 searchMeta（高亮 / 来源 / 分数），用于前端展示 */
export function decorateResults(
  results: SearchResult[],
  query: string,
  terms: string[],
  semanticIds = new Set<string>(),
  fuseIds = new Set<string>()
): NavLink[] {
  return results.map((result) => {
    const source: SearchSource =
      semanticIds.has(result.id) && fuseIds.has(result.id)
        ? "hybrid"
        : result.source;
    return toNavLinkResult({
      ...result,
      searchMeta: buildSearchMeta({
        link: toNavLinkResult(result),
        query,
        terms,
        source,
        score: result.score,
        similarity: result.similarity,
      }),
    });
  });
}

/**
 * 关键词命中加分：完全匹配 > 包含标题 > 包含描述 > 包含分类。
 * 数量级控制在 0.0005–0.003，确保只是 RRF 主分数之上的微调。
 */
function keywordBoost(result: SearchResult, query: string): number {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return 0;

  const title = result.title.toLowerCase();
  const description = (result.description ?? "").toLowerCase();
  const categoryName = (result.category_name ?? "").toLowerCase();
  const categorySlug = (result.category_slug ?? "").toLowerCase();

  if (title === normalizedQuery) return 0.003;
  if (title.includes(normalizedQuery)) return 0.002;
  if (description.includes(normalizedQuery)) return 0.001;
  if (categoryName.includes(normalizedQuery) || categorySlug.includes(normalizedQuery)) return 0.0005;
  return 0;
}

/** 质量分：把 Fuse score 与 semantic similarity 折算成同一量级的微调 */
function qualityBoost(result: SearchResult, query: string): number {
  const fuseBoost = result.score === undefined ? 0 : Math.max(0, 1 - result.score) * 0.001;
  const semanticBoost =
    result.similarity === undefined ? 0 : Math.max(0, result.similarity - MIN_SEMANTIC_SIMILARITY) * 0.001;
  return keywordBoost(result, query) + fuseBoost + semanticBoost;
}

/**
 * Hybrid merge using Reciprocal Rank Fusion (RRF).
 *
 * RRF combines ranked lists from different sources into a single scored list.
 * Each item gets score = sum(1 / (k + rank_in_source)) across all sources.
 * k = 60 is the standard RRF constant from the Cormack et al. paper.
 *
 * This replaces the old bucket-based merge that put all "strong keyword" hits
 * ahead of all semantic results, regardless of actual relevance.
 */
export function mergeResults(
  semantic: SearchResult[],
  fuse: SearchResult[],
  limit: number,
  query: string
): SearchResult[] {
  if (semantic.length === 0 && fuse.length === 0) return [];
  if (semantic.length === 0) return fuse.slice(0, limit);
  if (fuse.length === 0) return semantic.slice(0, limit);

  const K = 60;
  const scores = new Map<string, { result: SearchResult; score: number }>();

  const addRank = (results: SearchResult[]) => {
    for (let rank = 0; rank < results.length; rank++) {
      const r = results[rank];
      const existing = scores.get(r.id);
      const score = 1 / (K + rank + 1);
      if (existing) {
        existing.score += score + qualityBoost(r, query);
      } else {
        scores.set(r.id, { result: r, score: score + qualityBoost(r, query) });
      }
    }
  };

  addRank(semantic);
  addRank(fuse);

  const sorted = Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .map((s) => s.result);

  return sorted.slice(0, limit);
}
