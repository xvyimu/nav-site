"use client";

import { useRef } from "react";
import type { Category, NavLink } from "@/lib/types";
import type { PrecomputedNavData } from "@/lib/nav-derived-data";
import { useDerivedLinks } from "./navigation/useDerivedLinks";
import { useFilterState } from "./navigation/useFilterState";
import { useKeyboardNav } from "./navigation/useKeyboardNav";
import { useServerSearch } from "./navigation/useServerSearch";

export function useLinksFilter({
  categories,
  links,
  precomputed,
}: {
  categories: Category[];
  links: NavLink[];
  precomputed?: PrecomputedNavData;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const announceRef = useRef<HTMLDivElement>(null);

  const filters = useFilterState();
  const serverSearch = useServerSearch({
    rawSearch: filters.rawSearch,
    semanticSearch: filters.semanticSearch,
    activeCategory: filters.activeCategory,
    activeTags: filters.activeTags,
    minRatingFilter: filters.minRatingFilter,
    popularityFilter: filters.popularityFilter,
    links,
    setSearch: filters.setSearch,
  });
  const derived = useDerivedLinks({
    categories,
    links,
    activeCategory: filters.activeCategory,
    activeTags: filters.activeTags,
    sortMode: filters.sortMode,
    search: filters.search,
    serverResults: serverSearch.serverResults,
    precomputed,
  });
  const keyboard = useKeyboardNav({
    flatResults: derived.flatResults,
    rawSearch: filters.rawSearch,
    search: filters.search,
    activeCategory: filters.activeCategory,
    activeTags: filters.activeTags,
    totalResults: derived.totalResults,
    q: derived.q,
    tabKeys: derived.tabKeys,
    inputRef,
    resultsRef,
    announceRef,
    setRawSearch: filters.setRawSearch,
    setSearch: filters.setSearch,
    setServerResults: serverSearch.setServerResults,
    setActiveCategory: filters.setActiveCategory,
  });

  return {
    activeCategory: filters.activeCategory,
    setActiveCategory: filters.setActiveCategory,
    rawSearch: filters.rawSearch,
    setRawSearch: filters.setRawSearch,
    search: filters.search,
    setSearch: filters.setSearch,
    focusedIndex: keyboard.focusedIndex,
    setFocusedIndex: keyboard.setFocusedIndex,
    sortMode: filters.sortMode,
    setSortMode: filters.setSortMode,
    q: derived.q,
    searchLoading: serverSearch.searchLoading,
    semanticSearch: filters.semanticSearch,
    setSemanticSearch: filters.setSemanticSearch,

    activeTags: filters.activeTags,
    toggleTag: filters.toggleTag,
    clearTags: filters.clearTags,
    clearSearchExperienceFilters: filters.clearSearchExperienceFilters,
    availableTags: derived.availableTags,
    minRatingFilter: filters.minRatingFilter,
    setMinRatingFilter: filters.setMinRatingFilter,
    popularityFilter: filters.popularityFilter,
    setPopularityFilter: filters.setPopularityFilter,
    searchFacets: serverSearch.searchFacets,
    searchSuggestions: serverSearch.searchSuggestions,
    zeroResultRecommendations: serverSearch.zeroResultRecommendations,

    inputRef,
    resultsRef,
    announceRef,

    tabKeys: derived.tabKeys,
    tabCounts: derived.tabCounts,
    tabTree: derived.tabTree,
    currentLabel: derived.currentLabel,

    filtered: derived.filtered,
    featured: derived.featured,
    latest: derived.latest,
    popular: derived.popular,
    linkSections: derived.linkSections,
    showLinks: derived.showLinks,
    flatResults: derived.flatResults,
    totalResults: derived.totalResults,
    hasResults: derived.hasResults,

    handleSearchKeyDown: keyboard.handleSearchKeyDown,
    handleResultKeyDown: keyboard.handleResultKeyDown,
    resetFocus: keyboard.resetFocus,
  };
}
