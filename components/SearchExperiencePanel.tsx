"use client";

import { Filter, Flame, Folder, Sparkles, Star, Tags } from "lucide-react";
import type { NavLink } from "@/lib/types";
import type { PopularityFilter, SearchFacets, SearchSuggestion } from "@/lib/search-experience";

interface SearchExperiencePanelProps {
  query: string;
  loading: boolean;
  suggestions: SearchSuggestion[];
  facets: SearchFacets;
  results: NavLink[];
  activeTags: string[];
  activeCategory: string;
  onSuggestion: (value: string) => void;
  onCategoryChange: (slug: string) => void;
  onToggleTag: (slug: string) => void;
  minRating: number | null;
  onMinRatingChange: (value: number | null) => void;
  popularity: PopularityFilter | null;
  onPopularityChange: (value: PopularityFilter | null) => void;
  onClearFilters: () => void;
}

function suggestionLabel(type: SearchSuggestion["type"]): string {
  switch (type) {
    case "tool":
      return "工具";
    case "category":
      return "分类";
    case "tag":
      return "标签";
    case "query":
      return "搜索";
  }
}

export function SearchExperiencePanel({
  query,
  loading,
  suggestions,
  facets,
  results,
  activeTags,
  activeCategory,
  onSuggestion,
  onCategoryChange,
  onToggleTag,
  minRating,
  onMinRatingChange,
  popularity,
  onPopularityChange,
  onClearFilters,
}: SearchExperiencePanelProps) {
  const visibleSuggestions = suggestions.slice(0, 8);
  const visibleCategories = facets.categories.slice(0, 8);
  const visibleTags = facets.tags.slice(0, 10);
  const hasFilters = activeTags.length > 0 || minRating !== null || popularity !== null || activeCategory !== "all";
  const hasFacetOptions =
    visibleCategories.length > 0 ||
    visibleTags.length > 0 ||
    facets.ratings.some((rating) => rating.count > 0) ||
    facets.popularity.some((item) => item.count > 0);

  if (!query && visibleSuggestions.length === 0 && !hasFilters && !hasFacetOptions) {
    return null;
  }

  const topExplanations = results
    .map((link) => link.searchMeta?.explanation.label)
    .filter(Boolean)
    .slice(0, 3) as string[];

  return (
    <div className="space-y-3 rounded-lg border border-border/70 bg-card/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          {query ? "搜索建议" : "热门查询"}
        </span>
        {visibleSuggestions.length > 0 ? visibleSuggestions.map((suggestion) => (
          <button
            key={`${suggestion.type}:${suggestion.value}`}
            type="button"
            onClick={() => onSuggestion(suggestion.value)}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground/80 transition-colors hover:border-primary/40 hover:text-primary"
          >
            <span className="text-muted-foreground/60">{suggestionLabel(suggestion.type)}</span>
            {suggestion.label}
            {suggestion.count !== undefined && (
              <span className="tabular-nums text-muted-foreground/50">{suggestion.count}</span>
            )}
          </button>
        )) : (
          <span className="text-xs text-muted-foreground/60">
            {loading ? "正在分析匹配项" : "暂无建议"}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Filter className="h-3.5 w-3.5" aria-hidden="true" />
          筛选
        </span>

        {visibleCategories.map((category) => (
          <button
            key={category.value}
            type="button"
            onClick={() => onCategoryChange(activeCategory === category.value ? "all" : category.value)}
            className={`inline-flex h-7 max-w-full items-center gap-1 rounded-md border px-2 text-xs transition-colors ${
              activeCategory === category.value
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/70 bg-background text-foreground/75 hover:border-primary/30"
            }`}
            aria-pressed={activeCategory === category.value}
          >
            <Folder className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{category.label}</span>
            <span className="tabular-nums text-muted-foreground/50">{category.count}</span>
          </button>
        ))}

        {visibleTags.map((tag) => (
          <button
            key={tag.value}
            type="button"
            onClick={() => onToggleTag(tag.value)}
            className={`inline-flex h-7 max-w-full items-center gap-1 rounded-md border px-2 text-xs transition-colors ${
              activeTags.includes(tag.value)
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/70 bg-background text-foreground/75 hover:border-primary/30"
            }`}
            aria-pressed={activeTags.includes(tag.value)}
          >
            <Tags className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{tag.label}</span>
            <span className="tabular-nums text-muted-foreground/50">{tag.count}</span>
          </button>
        ))}

        {facets.ratings.filter((rating) => rating.count > 0).map((rating) => {
          const value = Number(rating.value);
          return (
            <button
              key={rating.value}
              type="button"
              onClick={() => onMinRatingChange(minRating === value ? null : value)}
              className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs transition-colors ${
                minRating === value
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/70 bg-background text-foreground/75 hover:border-primary/30"
              }`}
              aria-pressed={minRating === value}
            >
              <Star className="h-3 w-3" aria-hidden="true" />
              {rating.label}
              <span className="tabular-nums text-muted-foreground/50">{rating.count}</span>
            </button>
          );
        })}

        {facets.popularity.filter((item) => item.count > 0).map((item) => {
          const value = item.value as PopularityFilter;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onPopularityChange(popularity === value ? null : value)}
              className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs transition-colors ${
                popularity === value
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/70 bg-background text-foreground/75 hover:border-primary/30"
              }`}
              aria-pressed={popularity === value}
            >
              <Flame className="h-3 w-3" aria-hidden="true" />
              {item.label}
              <span className="tabular-nums text-muted-foreground/50">{item.count}</span>
            </button>
          );
        })}

        {hasFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="h-7 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            清除
          </button>
        )}
      </div>

      {topExplanations.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground/70">
          <span>排序依据</span>
          {topExplanations.map((item, index) => (
            <span key={`${item}:${index}`} className="rounded-md bg-muted/50 px-1.5 py-0.5">
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
