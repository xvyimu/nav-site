"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { PackageOpen, Search, Trophy, Waves } from "lucide-react";
import { type Category, type ModelRanking as ModelRankingType, type NavLink } from "@/lib/types";
import { fadeInUp, slideDown, staggerContainer } from "@/lib/animations";
import { CategorySection } from "./CategorySection";
import { DualTrackSection } from "./DualTrackSection";
import { HomeHero } from "./HomeHero";
import { SearchExperiencePanel } from "./SearchExperiencePanel";
import { Sidebar } from "./Sidebar";
import { ToolQuickView } from "./ToolQuickView";
import { useShell } from "./Shell";
import { useLinksFilter } from "./useLinksFilter";

const MobileNav = dynamic(() => import("./MobileNav").then((m) => m.MobileNav), {
  ssr: false,
  loading: () => null,
});

const ModelRanking = dynamic(() => import("./ModelRanking").then((m) => m.ModelRanking), {
  loading: () => <div className="h-32 rounded-lg bg-white/10 animate-pulse" />,
  ssr: false,
});

export function Navigation({
  categories,
  links,
  modelRankings = [],
}: {
  categories: Category[];
  links: NavLink[];
  modelRankings?: ModelRankingType[];
}) {
  const { sidebarOpen, closeSidebar } = useShell();
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
    showRankings, showLinks, filteredRankings,
    flatResults,
    handleSearchKeyDown, handleResultKeyDown,
  } = useLinksFilter({ categories, links, modelRankings });
  const [mounted, setMounted] = useState(false);
  const [previewLink, setPreviewLink] = useState<NavLink | null>(null);

  // 稳定的预览回调：避免每次渲染都生成新引用，破坏 LinkCard / ToolQuickView 的 memo
  const openPreview = useCallback((link: NavLink) => setPreviewLink(link), []);
  const closePreview = useCallback(() => setPreviewLink(null), []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeCategory, activeTags, minRatingFilter, popularityFilter]);

  const sectionOffset = featured.length + latest.length + popular.length;
  const topHeroTabs = tabTree
    .filter((tab) => tab.key !== "all" && tab.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-[#07100f]" data-nav-hydrated={mounted ? "true" : "false"}>
      <HomeHero
        totalLinks={links.length}
        categoryCount={categories.length}
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
        className="flex border-t border-white/10 bg-[linear-gradient(180deg,#07100f_0%,#0b1215_42%,#f8fafc_42%,#f8fafc_100%)] dark:bg-[linear-gradient(180deg,#07100f_0%,#101820_100%)]"
      >
        <Sidebar
          tabs={tabTree}
          activeKey={activeCategory}
          onSelect={setActiveCategory}
          open={sidebarOpen}
          onClose={closeSidebar}
          tags={availableTags}
          activeTags={activeTags}
          onToggleTag={toggleTag}
          onClearTags={clearTags}
        />

        <div className="min-w-0 flex-1">
          <motion.div
            className="mx-auto max-w-[1520px] space-y-6 px-4 py-6 md:px-8 md:py-8"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
          >
            <motion.div variants={slideDown}>
              <SearchExperiencePanel
                query={rawSearch.trim()}
                loading={searchLoading}
                suggestions={searchSuggestions}
                facets={searchFacets}
                results={flatResults.map((item) => item.link)}
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
            </motion.div>

            <div ref={announceRef} role="status" aria-live="polite" aria-atomic="true" className="sr-only" />

            {activeCategory !== "all" && (
              <motion.nav
                variants={slideDown}
                className="flex items-center gap-1.5 text-xs font-mono uppercase text-white/60"
                aria-label="Breadcrumb"
              >
                <span>Atlas</span>
                <span aria-hidden="true">/</span>
                <span className="text-white/85">{currentLabel}</span>
              </motion.nav>
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
                  sectionOffset={sectionOffset}
                  activeCategory={activeCategory}
                  focusedIndex={focusedIndex}
                  onFocusChange={setFocusedIndex}
                  onKeyDown={handleResultKeyDown}
                  searchQuery={q}
                  onPreview={openPreview}
                />
              ))}

              {showRankings && (
                <motion.section variants={fadeInUp}>
                  {activeCategory === "all" && (
                    <h2 className="atlas-section-label text-emerald-100">
                      <Trophy className="h-3.5 w-3.5" />
                      模型排行榜
                    </h2>
                  )}
                  <ModelRanking data={filteredRankings} />
                </motion.section>
              )}

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
                />
              )}
            </div>

            {mounted && flatResults.length === 0 && q && zeroResultRecommendations.length === 0 && (
              <motion.div className="nav-empty-state" variants={fadeInUp}>
                <Search className="h-8 w-8" aria-hidden="true" />
                <p className="text-sm">{`没有找到与 "${q}" 匹配的内容`}</p>
                <button
                  type="button"
                  aria-label="清除筛选"
                  onClick={() => {
                    setRawSearch("");
                    setSearch("");
                    setActiveCategory("all");
                    clearSearchExperienceFilters();
                    inputRef.current?.focus();
                  }}
                  className="text-xs underline underline-offset-2 transition-colors hover:text-white"
                >
                  清除筛选
                </button>
              </motion.div>
            )}

            {mounted && flatResults.length === 0 && !q && (
              <motion.div className="nav-empty-state" variants={fadeInUp}>
                {activeCategory !== "all" ? (
                  <PackageOpen className="h-8 w-8" aria-hidden="true" />
                ) : (
                  <Waves className="h-8 w-8" aria-hidden="true" />
                )}
                <p className="text-sm">
                  {activeCategory !== "all" ? "这个分类还没有收录任何站点" : "暂时没有已收录的站点"}
                </p>
                {activeCategory !== "all" && (
                  <button
                    type="button"
                    aria-label="清除筛选"
                    onClick={() => {
                      setRawSearch("");
                      setSearch("");
                      setActiveCategory("all");
                      inputRef.current?.focus();
                    }}
                    className="text-xs underline underline-offset-2 transition-colors hover:text-white"
                  >
                    清除筛选
                  </button>
                )}
              </motion.div>
            )}
          </motion.div>

          <MobileNav tabs={tabKeys} activeCategory={activeCategory} onSelect={setActiveCategory} />
          <div className="h-16 md:hidden" />
        </div>
      </div>
      <ToolQuickView link={previewLink} onClose={closePreview} />
    </div>
  );
}
