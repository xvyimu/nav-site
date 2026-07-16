"use client";

import { useEffect, useState } from "react";
import type { NavLink } from "@/lib/types";
import type {
  PopularityFilter,
  SearchFacets,
  SearchSuggestion,
} from "@/lib/search-experience";
import { buildSearchFacets, buildSearchSuggestions } from "@/lib/search-experience";

const EMPTY_SEARCH_FACETS: SearchFacets = {
  categories: [],
  tags: [],
  ratings: [],
  popularity: [],
};

export interface ServerSearchParams {
  rawSearch: string;
  semanticSearch: boolean;
  activeCategory: string;
  activeTags: string[];
  minRatingFilter: number | null;
  popularityFilter: PopularityFilter | null;
  links: NavLink[];
  setSearch: (v: string) => void;
}

export interface ServerSearchState {
  serverResults: NavLink[];
  searchLoading: boolean;
  searchFacets: SearchFacets;
  searchSuggestions: SearchSuggestion[];
  zeroResultRecommendations: NavLink[];
  setServerResults: (v: NavLink[]) => void;
}

export function useServerSearch(params: ServerSearchParams): ServerSearchState {
  const {
    rawSearch,
    semanticSearch,
    activeCategory,
    activeTags,
    minRatingFilter,
    popularityFilter,
    links,
    setSearch,
  } = params;

  const [serverResults, setServerResults] = useState<NavLink[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFacets, setSearchFacets] = useState<SearchFacets>(EMPTY_SEARCH_FACETS);
  const [searchSuggestions, setSearchSuggestions] = useState<SearchSuggestion[]>([]);
  const [zeroResultRecommendations, setZeroResultRecommendations] = useState<NavLink[]>([]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const q = rawSearch.trim();
    if (!q) {
      const localFacets = buildSearchFacets(links, {
        category: activeCategory,
        tagSlugs: activeTags,
        minRating: minRatingFilter,
        popularity: popularityFilter,
      });
      setSearch("");
      setServerResults([]);
      setSearchLoading(false);
      setSearchFacets(localFacets);
      setSearchSuggestions(buildSearchSuggestions("", links, localFacets));
      setZeroResultRecommendations([]);
      return;
    }

    setSearchLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearch(q);
      try {
        const sp = new URLSearchParams({ q });
        if (semanticSearch) sp.set("semantic", "true");
        if (activeCategory !== "all") sp.set("category", activeCategory);
        if (activeTags.length > 0) sp.set("tag", activeTags.join(","));
        if (minRatingFilter !== null) sp.set("minRating", String(minRatingFilter));
        if (popularityFilter) sp.set("popularity", popularityFilter);
        const res = await fetch(`/api/search?${sp}`, { signal: controller.signal });
        if (!res.ok) {
          setServerResults([]);
          setSearchFacets(EMPTY_SEARCH_FACETS);
          setSearchSuggestions([]);
          setZeroResultRecommendations([]);
        } else {
          const data = await res.json();
          const mapped: NavLink[] = (data.results || []).map((r: Record<string, unknown>) => ({
            id: r.id as string,
            title: r.title as string,
            url: r.url as string,
            description: r.description as string | null,
            icon: r.icon as string | null,
            category_id: null,
            approved: true,
            paid: r.paid as boolean,
            featured: r.featured as boolean,
            click_count: r.click_count as number,
            created_at: "",
            score: r.score as number | undefined,
            similarity: r.similarity as number | undefined,
            avg_rating: r.avg_rating as number | undefined,
            review_count: r.review_count as number | undefined,
            category_name: r.category_name as string | undefined,
            category_slug: r.category_slug as string | undefined,
            tags: r.tags as NavLink["tags"],
            searchMeta: r.searchMeta as NavLink["searchMeta"],
          }));
          setServerResults(mapped);
          setSearchFacets((data.facets ?? EMPTY_SEARCH_FACETS) as SearchFacets);
          setSearchSuggestions((data.suggestions ?? []) as SearchSuggestion[]);
          setZeroResultRecommendations((data.recommendations ?? []) as NavLink[]);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setServerResults([]);
        setSearchFacets(EMPTY_SEARCH_FACETS);
        setSearchSuggestions([]);
        setZeroResultRecommendations([]);
      }
      setSearchLoading(false);
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [rawSearch, activeCategory, semanticSearch, activeTags, minRatingFilter, popularityFilter, links, setSearch]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return {
    serverResults,
    searchLoading,
    searchFacets,
    searchSuggestions,
    zeroResultRecommendations,
    setServerResults,
  };
}
