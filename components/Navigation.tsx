"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { type Category, type NavLink } from "@/lib/types";
import type { PrecomputedNavData } from "@/lib/nav-derived-data";
import { HomeHero } from "./HomeHero";
import { Sidebar } from "./Sidebar";
import { useLinksFilter } from "./useLinksFilter";
import { AtlasWorkspace } from "./navigation/AtlasWorkspace";

const MobileNav = dynamic(() => import("./MobileNav").then((m) => m.MobileNav), {
  ssr: false,
  loading: () => null,
});

// 预览弹层含 Radix Dialog，仅首次打开时再拉入
const ToolQuickView = dynamic(
  () => import("./ToolQuickView").then((m) => m.ToolQuickView),
  { ssr: false, loading: () => null },
);

export function Navigation({
  categories,
  links,
  precomputed,
}: {
  categories: Category[];
  links: NavLink[];
  precomputed?: PrecomputedNavData;
}) {
  const {
    activeCategory, setActiveCategory,
    rawSearch, setRawSearch,
    setSearch,
    focusedIndex, setFocusedIndex,
    q,
    searchLoading,
    semanticSearch,
    setSemanticSearch,
    activeTags, toggleTag, clearTags, clearSearchExperienceFilters, availableTags,
    minRatingFilter, setMinRatingFilter,
    popularityFilter, setPopularityFilter,
    searchFacets, searchSuggestions, zeroResultRecommendations,
    inputRef, resultsRef, announceRef,
    tabKeys, tabTree, currentLabel,
    featured, latest, popular, linkSections,
    showLinks,
    flatResults,
    handleSearchKeyDown, handleResultKeyDown,
  } = useLinksFilter({ categories, links, precomputed });
  const [mounted, setMounted] = useState(false);
  const [previewLink, setPreviewLink] = useState<NavLink | null>(null);
  /** 打开预览时记录触发控件，关闭后把键盘焦点还回去（a11y / E2E）。 */
  const previewTriggerRef = useRef<HTMLElement | null>(null);

  // 稳定的预览回调：避免每次渲染都生成新引用，破坏 LinkCard / ToolQuickView 的 memo
  const openPreview = useCallback((link: NavLink) => {
    const active = document.activeElement;
    previewTriggerRef.current = active instanceof HTMLElement ? active : null;
    setPreviewLink(link);
  }, []);
  const closePreview = useCallback(() => setPreviewLink(null), []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  // Dialog 卸载后再 focus，避免与 Radix 焦点清理竞态
  useEffect(() => {
    if (previewLink !== null) return;
    const trigger = previewTriggerRef.current;
    if (!trigger) return;
    const frame = window.requestAnimationFrame(() => {
      trigger.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [previewLink]);

  // 侧栏/筛选变更时，仅在结果区不在视口时轻推到 #atlas；
  // 避免 window.scrollTo(top:0) 把用户强行拉回页顶。
  useEffect(() => {
    const atlas = document.getElementById("atlas");
    if (!atlas) return;
    const rect = atlas.getBoundingClientRect();
    const headerOffset = 72;
    const fullyAbove = rect.bottom < headerOffset;
    const fullyBelow = rect.top > window.innerHeight;
    if (!fullyAbove && !fullyBelow) return;
    atlas.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [activeCategory, activeTags, minRatingFilter, popularityFilter]);

  const topHeroTabs = tabTree
    .filter((tab) => tab.key !== "all" && tab.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const visibleCategoryCount = tabTree.filter((tab) => tab.key !== "all").length;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background" data-nav-hydrated={mounted ? "true" : "false"}>
      <HomeHero
        totalLinks={links.length}
        categoryCount={visibleCategoryCount}
        featuredCount={featured.length}
        topTabs={topHeroTabs}
        searchValue={rawSearch}
        onSearchChange={setRawSearch}
        onSearchKeyDown={handleSearchKeyDown}
        inputRef={inputRef}
        searchLoading={searchLoading}
        semanticSearch={semanticSearch}
        onSemanticSearchChange={setSemanticSearch}
        activeCategory={activeCategory}
        onCategorySelect={setActiveCategory}
      />

      <div
        id="atlas"
        className="flex border-t border-[var(--paper-line)] bg-[linear-gradient(180deg,#f8f6f2_0%,#f4f0e8_46%,#f8f6f2_100%)] dark:bg-[linear-gradient(180deg,var(--paper-bg)_0%,color-mix(in_srgb,var(--paper-bg)_92%,black)_46%,var(--paper-bg)_100%)]"
      >
        <Sidebar
          tabs={tabTree}
          activeKey={activeCategory}
          onSelect={setActiveCategory}
          tags={availableTags}
          activeTags={activeTags}
          onToggleTag={toggleTag}
          onClearTags={clearTags}
        />

        <div className="min-w-0 flex-1">
          <AtlasWorkspace
            rawSearch={rawSearch}
            setRawSearch={setRawSearch}
            setSearch={setSearch}
            searchLoading={searchLoading}
            searchSuggestions={searchSuggestions}
            searchFacets={searchFacets}
            flatResults={flatResults}
            activeTags={activeTags}
            activeCategory={activeCategory}
            setActiveCategory={setActiveCategory}
            toggleTag={toggleTag}
            minRatingFilter={minRatingFilter}
            setMinRatingFilter={setMinRatingFilter}
            popularityFilter={popularityFilter}
            setPopularityFilter={setPopularityFilter}
            clearSearchExperienceFilters={clearSearchExperienceFilters}
            currentLabel={currentLabel}
            featured={featured}
            latest={latest}
            popular={popular}
            linkSections={linkSections}
            showLinks={showLinks}
            focusedIndex={focusedIndex}
            setFocusedIndex={setFocusedIndex}
            handleResultKeyDown={handleResultKeyDown}
            q={q}
            openPreview={openPreview}
            zeroResultRecommendations={zeroResultRecommendations}
            mounted={mounted}
            inputRef={inputRef}
            resultsRef={resultsRef}
            announceRef={announceRef}
          />

          <MobileNav tabs={tabKeys} activeCategory={activeCategory} onSelect={setActiveCategory} />
          <div className="h-24 md:hidden" />
        </div>
      </div>
      <ToolQuickView link={previewLink} onClose={closePreview} />
    </div>
  );
}
