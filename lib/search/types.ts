import type { NavLink, SearchSource } from "@/lib/types";
import type Fuse from "fuse.js";
import type { SearchFilters } from "@/lib/search-experience";

/**
 * 搜索模块的共享类型定义
 *
 * 该文件不放任何运行时逻辑，只导出类型，
 * 便于 params/fuse/semantic/merge 各模块互相引用而不产生循环依赖。
 */

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  description: string | null;
  icon: string | null;
  category_name: string | undefined;
  category_slug: string | undefined;
  featured: boolean;
  paid: boolean;
  click_count: number;
  /** Fuse.js score: 0 = perfect, 1 = no match */
  score?: number;
  /** pgvector similarity: 1 = perfect, 0 = no match */
  similarity?: number;
  /** Result source */
  source: "fuse" | "semantic";
  tags?: NavLink["tags"];
  review_count?: number;
  avg_rating?: number;
  searchMeta?: NavLink["searchMeta"];
}

export interface SearchParams {
  q: string;
  category?: string;
  limit: number;
  semantic: boolean;
  filters: SearchFilters;
}

/** 用于 fuse.search() 的结果项类型（与 Fuse.js 内部类型对齐） */
export type FuseResultItem = {
  item: NavLink;
  score?: number;
};

/** pgvector search_links_semantic RPC 返回的行结构 */
export interface SemanticRow {
  id: string;
  title: string;
  url: string;
  description: string | null;
  icon: string | null;
  category_name: string | null;
  category_slug: string | null;
  similarity: number;
  featured: boolean;
  paid: boolean;
  click_count: number;
}

/** 用于 fuse 模块间的缓存结构 */
export interface FuseCache {
  fuse: Fuse<NavLink>;
  links: NavLink[];
  timestamp: number;
}

/** 主 search() 函数的返回结构 */
export interface SearchResponse {
  results: NavLink[];
  total: number;
  query: string;
  mode: "fuse" | "semantic";
  facets: ReturnType<typeof import("@/lib/search-experience").buildSearchFacets>;
  suggestions: ReturnType<typeof import("@/lib/search-experience").buildSearchSuggestions>;
  recommendations: ReturnType<typeof import("@/lib/search-experience").buildZeroResultRecommendations>;
  expandedTerms: string[];
  appliedSynonyms: string[];
  fallbackReason?: "short_query" | "embedding_unavailable" | "semantic_empty" | null;
}

/** 给 SearchSource 类型补一个混合来源（hybrid）的本地别名，便于 merge.ts 使用 */
export type MergedSource = SearchSource | "hybrid";
