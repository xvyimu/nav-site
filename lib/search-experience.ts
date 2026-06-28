import type { NavLink, SearchHighlight, SearchMatchField, SearchMeta, SearchSource } from "@/lib/types";

export type PopularityFilter = "featured" | "popular";

export interface SearchFilters {
  category?: string;
  tagSlugs: string[];
  minRating: number | null;
  popularity: PopularityFilter | null;
}

export interface SearchFacetOption {
  value: string;
  label: string;
  count: number;
  active?: boolean;
}

export interface SearchFacets {
  categories: SearchFacetOption[];
  tags: SearchFacetOption[];
  ratings: SearchFacetOption[];
  popularity: SearchFacetOption[];
}

export interface SearchSuggestion {
  value: string;
  label: string;
  type: "query" | "tool" | "category" | "tag";
  count?: number;
}

const SYNONYM_GROUPS = [
  ["ai", "artificial intelligence", "llm", "大模型", "人工智能", "模型"],
  ["api", "sdk", "接口", "开发接口"],
  ["vps", "server", "cloud server", "云服务器", "服务器", "主机"],
  ["deploy", "deployment", "hosting", "host", "部署", "托管"],
  ["code", "coding", "developer", "dev", "programming", "开发", "编程"],
  ["design", "ui", "ux", "设计", "原型"],
  ["image", "picture", "photo", "图片", "图像", "绘图"],
  ["video", "movie", "clip", "视频", "剪辑"],
  ["search", "retrieval", "搜索", "检索"],
  ["open source", "opensource", "oss", "开源"],
] as const;

const DEFAULT_FILTERS: SearchFilters = {
  category: undefined,
  tagSlugs: [],
  minRating: null,
  popularity: null,
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function latinWordSet(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

function includesTerm(text: string, term: string): boolean {
  const normalizedText = normalizeText(text);
  const normalizedTerm = normalizeText(term);
  if (!normalizedText || !normalizedTerm) return false;

  if (/^[a-z0-9]+$/i.test(normalizedTerm) && normalizedTerm.length <= 3) {
    return latinWordSet(normalizedText).has(normalizedTerm);
  }

  return normalizedText.includes(normalizedTerm);
}

export function normalizeSearchFilters(filters?: Partial<SearchFilters>): SearchFilters {
  return {
    ...DEFAULT_FILTERS,
    ...filters,
    category: filters?.category && filters.category !== "all" ? filters.category : undefined,
    tagSlugs: Array.from(new Set(filters?.tagSlugs ?? [])).filter(Boolean),
  };
}

export function expandQueryTerms(query: string): { terms: string[]; appliedSynonyms: string[] } {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return { terms: [], appliedSynonyms: [] };

  const terms = new Set<string>([normalizedQuery]);
  const appliedSynonyms = new Set<string>();
  const queryWords = latinWordSet(normalizedQuery);

  for (const group of SYNONYM_GROUPS) {
    const matched = group.some((term) => {
      const normalizedTerm = normalizeText(term);
      if (normalizedQuery === normalizedTerm) return true;
      if (/^[a-z0-9]+$/i.test(normalizedTerm) && normalizedTerm.length <= 3) {
        return queryWords.has(normalizedTerm);
      }
      return normalizedQuery.includes(normalizedTerm);
    });

    if (!matched) continue;
    for (const term of group) {
      const normalizedTerm = normalizeText(term);
      if (normalizedTerm && normalizedTerm !== normalizedQuery) {
        terms.add(normalizedTerm);
        appliedSynonyms.add(normalizedTerm);
      }
    }
  }

  return {
    terms: Array.from(terms).slice(0, 10),
    appliedSynonyms: Array.from(appliedSynonyms).slice(0, 9),
  };
}

export function linkMatchesSearchFilters(link: NavLink, filters: SearchFilters): boolean {
  if (filters.tagSlugs.length > 0) {
    const linkTagSlugs = new Set((link.tags ?? []).map((tag) => tag.slug));
    if (!filters.tagSlugs.every((slug) => linkTagSlugs.has(slug))) return false;
  }

  if (filters.minRating !== null && (link.avg_rating ?? 0) < filters.minRating) {
    return false;
  }

  if (filters.popularity === "featured" && !link.featured && !link.paid) {
    return false;
  }

  if (filters.popularity === "popular" && link.click_count < 5) {
    return false;
  }

  return true;
}

export function applySearchFilters(links: NavLink[], filters?: Partial<SearchFilters>): NavLink[] {
  const normalized = normalizeSearchFilters(filters);
  return links.filter((link) => linkMatchesSearchFilters(link, normalized));
}

function sortedFacetOptions(options: Map<string, SearchFacetOption>, limit: number): SearchFacetOption[] {
  return Array.from(options.values())
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-Hans"))
    .slice(0, limit);
}

export function buildSearchFacets(links: NavLink[], filters?: Partial<SearchFilters>): SearchFacets {
  const normalized = normalizeSearchFilters(filters);
  const categoryOptions = new Map<string, SearchFacetOption>();
  const tagOptions = new Map<string, SearchFacetOption>();

  for (const link of links) {
    if (link.category_slug) {
      const option = categoryOptions.get(link.category_slug) ?? {
        value: link.category_slug,
        label: link.category_name ?? link.category_slug,
        count: 0,
        active: normalized.category === link.category_slug,
      };
      option.count += 1;
      option.active = normalized.category === link.category_slug;
      categoryOptions.set(link.category_slug, option);
    }

    for (const tag of link.tags ?? []) {
      const option = tagOptions.get(tag.slug) ?? {
        value: tag.slug,
        label: tag.name,
        count: 0,
        active: normalized.tagSlugs.includes(tag.slug),
      };
      option.count += 1;
      option.active = normalized.tagSlugs.includes(tag.slug);
      tagOptions.set(tag.slug, option);
    }
  }

  return {
    categories: sortedFacetOptions(categoryOptions, 12),
    tags: sortedFacetOptions(tagOptions, 16),
    ratings: [4.5, 4, 3].map((rating) => ({
      value: String(rating),
      label: rating === 4.5 ? "4.5+" : `${rating}+`,
      count: links.filter((link) => (link.avg_rating ?? 0) >= rating).length,
      active: normalized.minRating === rating,
    })),
    popularity: [
      {
        value: "featured",
        label: "精选",
        count: links.filter((link) => link.featured || link.paid).length,
        active: normalized.popularity === "featured",
      },
      {
        value: "popular",
        label: "热门",
        count: links.filter((link) => link.click_count >= 5).length,
        active: normalized.popularity === "popular",
      },
    ],
  };
}

export function buildHighlights(link: NavLink, terms: string[]): SearchHighlight[] {
  const highlights: SearchHighlight[] = [];
  const add = (field: SearchMatchField, label: string, value: string | null | undefined) => {
    if (!value) return;
    if (terms.some((term) => includesTerm(value, term))) {
      highlights.push({ field, label, value });
    }
  };

  add("title", "标题", link.title);
  add("description", "描述", link.description);
  add("category", "分类", link.category_name ?? link.category_slug);
  add("url", "网址", link.url);

  for (const tag of link.tags ?? []) {
    add("tag", "标签", tag.name);
  }

  return highlights.slice(0, 4);
}

export function buildSearchMeta(input: {
  link: NavLink;
  query: string;
  terms: string[];
  source: SearchSource;
  score?: number;
  similarity?: number;
}): SearchMeta {
  const highlights = buildHighlights(input.link, input.terms);
  const matchedFields = Array.from(new Set(highlights.map((highlight) => highlight.field)));
  const sourceLabel =
    input.source === "hybrid" ? "混合命中" :
      input.source === "semantic" ? "语义命中" :
        "关键词命中";
  const scoreLabel =
    input.similarity !== undefined ? `${Math.round(input.similarity * 100)}%` :
      input.score !== undefined ? `${Math.round((1 - input.score) * 100)}%` :
        undefined;

  const signals: string[] = [];
  if (matchedFields.length > 0) signals.push(matchedFields.map(labelMatchField).join(" / "));
  if (input.link.featured || input.link.paid) signals.push("精选");
  if (input.link.click_count >= 5) signals.push("热门");
  if ((input.link.avg_rating ?? 0) >= 4) signals.push(`${input.link.avg_rating?.toFixed(1)} 星`);

  return {
    query: input.query,
    expandedTerms: input.terms,
    source: input.source,
    score: input.score,
    similarity: input.similarity,
    highlights,
    explanation: {
      label: scoreLabel ? `${sourceLabel} ${scoreLabel}` : sourceLabel,
      reason: signals.length > 0 ? signals.join(" · ") : sourceLabel,
      matchedFields,
    },
  };
}

export function labelMatchField(field: SearchMatchField): string {
  switch (field) {
    case "title":
      return "标题";
    case "description":
      return "描述";
    case "category":
      return "分类";
    case "tag":
      return "标签";
    case "url":
      return "网址";
  }
}

export function buildSearchSuggestions(
  query: string,
  links: NavLink[],
  facets: SearchFacets,
  limit = 8,
): SearchSuggestion[] {
  const { terms } = expandQueryTerms(query);
  const suggestions: SearchSuggestion[] = [];
  const seen = new Set<string>();
  const add = (suggestion: SearchSuggestion) => {
    const key = `${suggestion.type}:${suggestion.value.toLowerCase()}`;
    if (seen.has(key) || suggestions.length >= limit) return;
    seen.add(key);
    suggestions.push(suggestion);
  };

  if (terms.length === 0) {
    for (const link of [...links].sort((a, b) => b.click_count - a.click_count).slice(0, 4)) {
      add({ type: "tool", value: link.title, label: link.title });
    }
    for (const category of facets.categories.slice(0, 3)) {
      add({ type: "category", value: category.label, label: category.label, count: category.count });
    }
    for (const tag of facets.tags.slice(0, 3)) {
      add({ type: "tag", value: tag.label, label: tag.label, count: tag.count });
    }
    return suggestions;
  }

  for (const link of links) {
    const haystack = [link.title, link.description, link.category_name, ...(link.tags ?? []).map((tag) => tag.name)].join(" ");
    if (terms.some((term) => includesTerm(haystack, term))) {
      add({ type: "tool", value: link.title, label: link.title });
    }
  }

  for (const category of facets.categories) {
    if (terms.some((term) => includesTerm(category.label, term) || includesTerm(category.value, term))) {
      add({ type: "category", value: category.label, label: category.label, count: category.count });
    }
  }

  for (const tag of facets.tags) {
    if (terms.some((term) => includesTerm(tag.label, term) || includesTerm(tag.value, term))) {
      add({ type: "tag", value: tag.label, label: tag.label, count: tag.count });
    }
  }

  return suggestions;
}

export function buildZeroResultRecommendations(links: NavLink[], limit = 6): NavLink[] {
  return [...links]
    .sort((a, b) => {
      const aScore = (a.featured || a.paid ? 1000 : 0) + a.click_count + (a.avg_rating ?? 0) * 10;
      const bScore = (b.featured || b.paid ? 1000 : 0) + b.click_count + (b.avg_rating ?? 0) * 10;
      return bScore - aScore;
    })
    .slice(0, limit);
}
