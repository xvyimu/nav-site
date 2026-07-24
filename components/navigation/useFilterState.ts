"use client";

import { useCallback, useEffect, useState } from "react";
import type { PopularityFilter } from "@/lib/search-experience";
import {
  buildNavigationUrl,
  parseFiltersFromUrl,
  readInitialFilters,
  type ParsedUrlFilters,
} from "@/lib/navigation/url-state";
import type { SortMode } from "./types";

export interface FilterState {
  activeCategory: string;
  rawSearch: string;
  search: string;
  semanticSearch: boolean;
  activeTags: string[];
  sortMode: SortMode;
  minRatingFilter: number | null;
  popularityFilter: PopularityFilter | null;
  setActiveCategory: (v: string) => void;
  setRawSearch: (v: string) => void;
  setSearch: (v: string) => void;
  setSemanticSearch: (v: boolean) => void;
  setSortMode: (v: SortMode) => void;
  setMinRatingFilter: (v: number | null) => void;
  setPopularityFilter: (v: PopularityFilter | null) => void;
  toggleTag: (slug: string) => void;
  clearTags: () => void;
  clearSearchExperienceFilters: () => void;
}

/**
 * Prefer RSC-seeded initialFilters (from page searchParams) so SSR HTML matches
 * shareable ?cat= / ?q= URLs. Fall back to window URL only when seed is absent
 * (tests / isolated mounts).
 */
export function useFilterState(initialFilters?: ParsedUrlFilters): FilterState {
  const [initial] = useState<ParsedUrlFilters>(
    () => initialFilters ?? readInitialFilters(),
  );
  const [activeCategory, setActiveCategory] = useState(initial.cat);
  const [rawSearch, setRawSearch] = useState(initial.q);
  const [search, setSearch] = useState(initial.q);
  const [semanticSearch, setSemanticSearch] = useState(initial.semantic);
  const [activeTags, setActiveTags] = useState<string[]>(initial.tags);
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("nav-sort-mode");
      if (saved === "newest" || saved === "popular") return saved;
    }
    return "default";
  });
  const [minRatingFilter, setMinRatingFilter] = useState<number | null>(initial.minRating);
  const [popularityFilter, setPopularityFilter] = useState<PopularityFilter | null>(initial.popularity);

  useEffect(() => {
    localStorage.setItem("nav-sort-mode", sortMode);
  }, [sortMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const newUrl = buildNavigationUrl({
      search,
      activeCategory,
      activeTags,
      minRatingFilter,
      popularityFilter,
      semanticSearch,
    });
    const currentUrl = window.location.pathname + window.location.search;
    if (currentUrl !== newUrl) {
      window.history.replaceState(null, "", newUrl);
    }
  }, [search, activeCategory, activeTags, minRatingFilter, popularityFilter, semanticSearch]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handlePopState = () => {
      const parsed = parseFiltersFromUrl(new URLSearchParams(window.location.search));
      setActiveCategory(parsed.cat);
      setRawSearch(parsed.q);
      setSearch(parsed.q);
      setActiveTags(parsed.tags);
      setMinRatingFilter(parsed.minRating);
      setPopularityFilter(parsed.popularity);
      setSemanticSearch(parsed.semantic);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const toggleTag = useCallback((slug: string) => {
    setActiveTags((prev) =>
      prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : [...prev, slug]
    );
  }, []);
  const clearTags = useCallback(() => setActiveTags([]), []);
  const clearSearchExperienceFilters = useCallback(() => {
    setActiveTags([]);
    setMinRatingFilter(null);
    setPopularityFilter(null);
  }, []);

  return {
    activeCategory,
    rawSearch,
    search,
    semanticSearch,
    activeTags,
    sortMode,
    minRatingFilter,
    popularityFilter,
    setActiveCategory,
    setRawSearch,
    setSearch,
    setSemanticSearch,
    setSortMode,
    setMinRatingFilter,
    setPopularityFilter,
    toggleTag,
    clearTags,
    clearSearchExperienceFilters,
  };
}
