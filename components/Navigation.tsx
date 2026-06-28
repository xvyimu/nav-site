"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { type Category, type NavLink } from "@/lib/types";
import { motion } from "motion/react";
import { Search, PackageOpen, Waves, Trophy } from "lucide-react";
import { SearchBar } from "./SearchBar";
import type { ModelRanking as ModelRankingType } from "@/lib/types";
import { staggerContainer, fadeInUp, slideDown } from "@/lib/animations";
import { Sidebar } from "./Sidebar";
import { useShell } from "./Shell";
import { useLinksFilter } from "./useLinksFilter";
import { DualTrackSection } from "./DualTrackSection";
import { CategorySection } from "./CategorySection";

// 动态导入 MobileNav — 仅移动端可见，桌面端不加载
const MobileNav = dynamic(() => import("./MobileNav").then((m) => m.MobileNav), {
  ssr: false,
  loading: () => null,
});

// 动态导入 ModelRanking — 仅在需要时加载
const ModelRanking = dynamic(() => import("./ModelRanking").then((m) => m.ModelRanking), {
  loading: () => (
    <div className="h-32 rounded-lg bg-muted/30 animate-pulse" />
  ),
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
    // State
    activeCategory, setActiveCategory,
    rawSearch, setRawSearch,
    setSearch,
    focusedIndex, setFocusedIndex,
    q,
    searchLoading,
    // Tag filter
    activeTags, toggleTag, clearTags, availableTags,
    // Refs (only used in event handlers and JSX ref props)
    inputRef, resultsRef, announceRef,
    // Tab data
    tabKeys, tabTree, currentLabel,
    // Derived data
    featured, latest, popular, linkSections,
    showRankings, showLinks, filteredRankings,
    flatResults,
    // Handlers
    handleSearchKeyDown, handleResultKeyDown,
  } = useLinksFilter({ categories, links, modelRankings });
  const [mounted, setMounted] = useState(false);
  // SSR/CSR 挂载标记：避免水合不匹配
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  // Smooth scroll to top on category switch
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeCategory]);

  const sectionOffset = featured.length + latest.length + popular.length;

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]" data-nav-hydrated={mounted ? "true" : "false"}>
      {/* ─── Sidebar ─── */}
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

      {/* ─── Main content area ─── */}
      <div className="flex-1 min-w-0">
        <motion.div
          className="px-4 py-6 md:px-6 space-y-6"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          {/* ─── Search ─── */}
          <motion.div variants={slideDown}>
            <SearchBar
              value={rawSearch}
              onChange={setRawSearch}
              onKeyDown={handleSearchKeyDown}
              inputRef={inputRef}
              loading={searchLoading}
            />
          </motion.div>

          {/* ─── Screen reader announce ─── */}
          <div ref={announceRef} role="status" aria-live="polite" aria-atomic="true" className="sr-only" />

          {/* ─── Breadcrumb ─── */}
          {activeCategory !== "all" && (
            <motion.nav
              variants={slideDown}
              className="flex items-center gap-1.5 text-xs text-muted-foreground/70"
              aria-label="面包屑导航"
            >
              <span>首页</span>
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-foreground/60 font-medium">{currentLabel}</span>
            </motion.nav>
          )}

          {/* ─── Results container ─── */}
          <div ref={resultsRef} className="space-y-6">
            {/* Featured + Latest */}
            <DualTrackSection
              featured={featured}
              latest={latest}
              popular={popular}
              featuredOffset={0}
              focusedIndex={focusedIndex}
              onFocusChange={setFocusedIndex}
              onKeyDown={handleResultKeyDown}
              searchQuery={q}
            />

            {/* Link sections */}
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
              />
            ))}

            {/* Model rankings */}
            {showRankings && (
              <motion.section variants={fadeInUp}>
                {activeCategory === "all" && (
                  <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-primary flex items-center gap-2">
                    <Trophy className="h-3.5 w-3.5" />
                    模型排行榜
                  </h2>
                )}
                <ModelRanking data={filteredRankings} />
              </motion.section>
            )}
          </div>

          {/* Search empty state */}
          {mounted && flatResults.length === 0 && q && (
            <motion.div className="flex flex-col items-center gap-3 py-20 text-muted-foreground/40" variants={fadeInUp}>
              <Search className="h-8 w-8" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                {`没有找到与"${q}"匹配的内容`}
              </p>
              <button type="button" aria-label="清除筛选" onClick={() => { setRawSearch(""); setSearch(""); setActiveCategory("all"); inputRef.current?.focus(); }}
                className="text-xs text-muted-foreground/70 hover:text-muted-foreground underline-offset-2 underline transition-colors">
                清除筛选
              </button>
            </motion.div>
          )}

          {/* Non-search empty state */}
          {mounted && flatResults.length === 0 && !q && (
            <motion.div className="flex flex-col items-center gap-3 py-20 text-muted-foreground/40" variants={fadeInUp}>
              {activeCategory !== "all" ? (
                <PackageOpen className="h-8 w-8" aria-hidden="true" />
              ) : (
                <Waves className="h-8 w-8" aria-hidden="true" />
              )}
              <p className="text-sm text-muted-foreground">
                {activeCategory !== "all"
                  ? "这个分类还没有收录任何站点"
                  : "暂时没有已收录的站点"}
              </p>
              {activeCategory !== "all" && (
                <button type="button" aria-label="清除筛选" onClick={() => { setRawSearch(""); setSearch(""); setActiveCategory("all"); inputRef.current?.focus(); }}
                  className="text-xs text-muted-foreground/70 hover:text-muted-foreground underline-offset-2 underline transition-colors">
                  清除筛选
                </button>
              )}
            </motion.div>
          )}
        </motion.div>

        {/* Mobile bottom nav */}
        <MobileNav tabs={tabKeys} activeCategory={activeCategory} onSelect={setActiveCategory} />
        <div className="h-16 md:hidden" />
      </div>
    </div>
  );
}
