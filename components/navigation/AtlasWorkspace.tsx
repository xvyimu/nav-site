"use client";

import { PackageOpen, Search, Waves } from "lucide-react";
import { useMemo, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import type { NavLink } from "@/lib/types";
import type { PopularityFilter, SearchFacets, SearchSuggestion } from "@/lib/search-experience";
import { CategorySection } from "@/components/CategorySection";
import { DualTrackSection } from "@/components/DualTrackSection";
import { SearchExperiencePanel } from "@/components/SearchExperiencePanel";
import { Button } from "@/components/ui/button";
import { allocateSectionMountBudget } from "./mount-budget";

const INITIAL_LINK_CARD_BUDGET = 24;

const emptyClearClass =
  "h-auto p-0 text-xs text-[var(--paper-muted)] underline underline-offset-2 hover:text-[var(--paper-accent)]";

interface AtlasWorkspaceProps {
  rawSearch: string;
  setRawSearch: (value: string) => void;
  setSearch: (value: string) => void;
  searchLoading: boolean;
  searchSuggestions: SearchSuggestion[];
  searchFacets: SearchFacets;
  flatResults: Array<{ link: NavLink }>;
  activeTags: string[];
  activeCategory: string;
  setActiveCategory: (key: string) => void;
  toggleTag: (slug: string) => void;
  minRatingFilter: number | null;
  setMinRatingFilter: (value: number | null) => void;
  popularityFilter: PopularityFilter | null;
  setPopularityFilter: (value: PopularityFilter | null) => void;
  clearSearchExperienceFilters: () => void;
  currentLabel: string;
  featured: NavLink[];
  latest: NavLink[];
  popular: NavLink[];
  linkSections: Array<{
    key: string;
    links: NavLink[];
    label: string;
    accent: string;
  }>;
  showLinks: boolean;
  focusedIndex: number;
  setFocusedIndex: (index: number) => void;
  handleResultKeyDown: (e: KeyboardEvent<HTMLElement>, index: number) => void;
  q: string;
  openPreview: (link: NavLink) => void;
  zeroResultRecommendations: NavLink[];
  mounted: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  resultsRef: RefObject<HTMLDivElement | null>;
  announceRef: RefObject<HTMLDivElement | null>;
}

export function AtlasWorkspace({
  rawSearch,
  setRawSearch,
  setSearch,
  searchLoading,
  searchSuggestions,
  searchFacets,
  flatResults,
  activeTags,
  activeCategory,
  setActiveCategory,
  toggleTag,
  minRatingFilter,
  setMinRatingFilter,
  popularityFilter,
  setPopularityFilter,
  clearSearchExperienceFilters,
  currentLabel,
  featured,
  latest,
  popular,
  linkSections,
  showLinks,
  focusedIndex,
  setFocusedIndex,
  handleResultKeyDown,
  q,
  openPreview,
  zeroResultRecommendations,
  mounted,
  inputRef,
  resultsRef,
  announceRef,
}: AtlasWorkspaceProps) {
  // 按 flatResults / 分区同序累加 offset，避免每个 CategorySection 共用同一 sectionOffset
  const sectionOffsets = useMemo(() => {
    let running = featured.length + latest.length + popular.length;
    const map = new Map<string, number>();
    for (const section of linkSections) {
      map.set(section.key, running);
      running += section.links.length;
    }
    return map;
  }, [featured.length, latest.length, popular.length, linkSections]);

  const panelResults = useMemo(
    () => flatResults.map((item) => item.link),
    [flatResults],
  );

  const sectionInitialCounts = useMemo(() => {
    const counts = allocateSectionMountBudget(
      linkSections.map((section) => section.links.length),
      INITIAL_LINK_CARD_BUDGET,
      featured.length + latest.length + popular.length
    );
    return new Map(linkSections.map((section, index) => [section.key, counts[index] ?? 0]));
  }, [featured.length, latest.length, popular.length, linkSections]);

  const clearBase = () => {
    setRawSearch("");
    setSearch("");
    setActiveCategory("all");
    inputRef.current?.focus();
  };

  const clearAll = () => {
    clearSearchExperienceFilters();
    clearBase();
  };

  return (
    <div className="mx-auto max-w-[1520px] space-y-6 px-4 py-6 md:px-8 md:py-8">
        <SearchExperiencePanel
          query={rawSearch.trim()}
          loading={searchLoading}
          suggestions={searchSuggestions}
          facets={searchFacets}
          results={panelResults}
          activeTags={activeTags}
          activeCategory={activeCategory}
          onSuggestion={(value) => {
            setRawSearch(value);
            inputRef.current?.focus();
          }}
          onCategoryChange={setActiveCategory}
          onToggleTag={toggleTag}
          minRating={minRatingFilter}
          onMinRatingChange={setMinRatingFilter}
          popularity={popularityFilter}
          onPopularityChange={setPopularityFilter}
          onClearFilters={() => {
            clearSearchExperienceFilters();
            setActiveCategory("all");
          }}
        />

        <div ref={announceRef} role="status" aria-live="polite" aria-atomic="true" className="sr-only" />

        {activeCategory !== "all" && (
          <nav
            className="flex animate-slide-down items-center gap-1.5 text-xs font-mono uppercase text-[var(--paper-muted)]"
            aria-label="Breadcrumb"
          >
            <span>Atlas</span>
            <span aria-hidden="true">/</span>
            <span className="text-[var(--paper-ink)]">{currentLabel}</span>
          </nav>
        )}

        <div ref={resultsRef} className="space-y-7">
          <DualTrackSection
            featured={featured}
            latest={latest}
            popular={popular}
            featuredOffset={0}
            focusedIndex={focusedIndex}
            onFocusChange={setFocusedIndex}
            onKeyDown={handleResultKeyDown}
            searchQuery={q}
            onPreview={openPreview}
          />

          {showLinks && linkSections.map((section) => (
            <CategorySection
              key={section.key}
              section={section}
              sectionOffset={sectionOffsets.get(section.key) ?? 0}
              activeCategory={activeCategory}
              focusedIndex={focusedIndex}
              onFocusChange={setFocusedIndex}
              onKeyDown={handleResultKeyDown}
              searchQuery={q}
              onPreview={openPreview}
              initialVisible={sectionInitialCounts.get(section.key) ?? 0}
            />
          ))}

          {q && flatResults.length === 0 && zeroResultRecommendations.length > 0 && (
            <CategorySection
              section={{
                key: "zero-result-recommendations",
                links: zeroResultRecommendations,
                label: "推荐工具",
                accent: "",
              }}
              sectionOffset={0}
              activeCategory="zero-result-recommendations"
              focusedIndex={-1}
              onFocusChange={() => {}}
              onKeyDown={() => {}}
              searchQuery={q}
              onPreview={openPreview}
              initialVisible={Math.min(INITIAL_LINK_CARD_BUDGET, zeroResultRecommendations.length)}
            />
          )}
        </div>

        {mounted && flatResults.length === 0 && q && zeroResultRecommendations.length === 0 && (
          <EmptyState
            icon={<Search className="h-8 w-8" aria-hidden="true" />}
            message={`没有找到与 "${q}" 匹配的内容`}
            onClear={clearAll}
          />
        )}

        {mounted && flatResults.length === 0 && !q && (
          <EmptyState
            icon={
              activeCategory !== "all" ? (
                <PackageOpen className="h-8 w-8" aria-hidden="true" />
              ) : (
                <Waves className="h-8 w-8" aria-hidden="true" />
              )
            }
            message={
              activeCategory !== "all" ? "这个分类还没有收录任何站点" : "暂时没有已收录的站点"
            }
            onClear={activeCategory !== "all" ? clearBase : undefined}
          />
        )}
    </div>
  );
}

function EmptyState({
  icon,
  message,
  onClear,
}: {
  icon: ReactNode;
  message: string;
  onClear?: () => void;
}) {
  return (
    <div className="nav-empty-state animate-fade-in-up">
      {icon}
      <p className="text-sm">{message}</p>
      {onClear && (
        <Button
          type="button"
          variant="link"
          aria-label="清除筛选"
          onClick={onClear}
          className={emptyClearClass}
        >
          清除筛选
        </Button>
      )}
    </div>
  );
}
