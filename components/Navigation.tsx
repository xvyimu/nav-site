"use client";

import { useState, useEffect } from "react";
import { type Category, type NavLink } from "@/lib/types";
import { motion } from "motion/react";
import { SearchBar } from "./SearchBar";
import { ModelRanking, type ModelRanking as ModelRankingType } from "./ModelRanking";
import { staggerContainer, fadeInUp, slideDown } from "@/lib/animations";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { useShell } from "./Shell";
import { useLinksFilter } from "./useLinksFilter";
import { DualTrackSection } from "./DualTrackSection";
import { CategorySection } from "./CategorySection";

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
  const ctx = useLinksFilter({ categories, links, modelRankings });
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Smooth scroll to top on category switch
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [ctx.activeCategory]);

  const sectionOffset = ctx.featured.length + ctx.latest.length;

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* ─── Sidebar ─── */}
      <Sidebar
        tabs={ctx.tabCounts}
        activeKey={ctx.activeCategory}
        onSelect={ctx.setActiveCategory}
        open={sidebarOpen}
        onClose={closeSidebar}
      />

      {/* ─── Main content area ─── */}
      <div className="flex-1 min-w-0">
        <motion.div
          className="px-4 py-6 md:px-6 max-w-6xl mx-auto space-y-6"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          {/* ─── Search ─── */}
          <motion.div variants={slideDown}>
            <SearchBar
              value={ctx.rawSearch}
              onChange={ctx.setRawSearch}
              onKeyDown={ctx.handleSearchKeyDown}
              inputRef={ctx.inputRef}
            />
          </motion.div>

          {/* ─── Screen reader announce ─── */}
          <div ref={ctx.announceRef} role="status" aria-live="polite" aria-atomic="true" className="sr-only" />

          {/* ─── Breadcrumb ─── */}
          {ctx.activeCategory !== "all" && (
            <motion.nav
              variants={slideDown}
              className="flex items-center gap-1.5 text-xs text-muted-foreground/70"
              aria-label="面包屑导航"
            >
              <span>首页</span>
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-foreground/60 font-medium">{ctx.currentLabel}</span>
            </motion.nav>
          )}

          {/* ─── Results container ─── */}
          <div ref={ctx.resultsRef} className="space-y-6">
            {/* Featured + Latest */}
            <DualTrackSection
              featured={ctx.featured}
              latest={ctx.latest}
              featuredOffset={0}
              focusedIndex={ctx.focusedIndex}
              onFocusChange={ctx.setFocusedIndex}
              onKeyDown={ctx.handleResultKeyDown}
            />

            {/* Link sections */}
            {ctx.showLinks && ctx.linkSections.map((section) => (
              <CategorySection
                key={section.key}
                section={section}
                sectionOffset={sectionOffset}
                activeCategory={ctx.activeCategory}
                focusedIndex={ctx.focusedIndex}
                onFocusChange={ctx.setFocusedIndex}
                onKeyDown={ctx.handleResultKeyDown}
              />
            ))}

            {/* Model rankings */}
            {ctx.showRankings && (
              <motion.section variants={fadeInUp}>
                {ctx.activeCategory === "all" && (
                  <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-purple-600 dark:text-purple-400 flex items-center gap-2">
                    <span className="inline-block w-4 h-px bg-purple-400" />
                    模型排行榜
                  </h2>
                )}
                <ModelRanking data={ctx.filteredRankings} />
              </motion.section>
            )}
          </div>

          {/* Empty state */}
          {mounted && !ctx.hasResults && (
            <motion.div className="flex flex-col items-center gap-3 py-20 text-muted-foreground/40" variants={fadeInUp}>
              <span className="text-3xl" role="img" aria-hidden="true">
                {ctx.q ? "🔍" : ctx.activeCategory !== "all" ? "📭" : "🌊"}
              </span>
              <p className="text-sm text-muted-foreground">
                {ctx.q
                  ? `没有找到与"${ctx.q}"匹配的内容`
                  : ctx.activeCategory !== "all"
                    ? "这个分类还没有收录任何站点"
                    : "暂时没有已收录的站点"}
              </p>
              {(ctx.q || ctx.activeCategory !== "all") && (
                <button onClick={() => { ctx.setRawSearch(""); ctx.setSearch(""); ctx.setActiveCategory("all"); ctx.inputRef.current?.focus(); }}
                  className="text-xs text-muted-foreground/70 hover:text-muted-foreground underline-offset-2 underline transition-colors">
                  清除筛选
                </button>
              )}
            </motion.div>
          )}
        </motion.div>

        {/* Mobile bottom nav */}
        <MobileNav tabs={ctx.tabKeys} activeCategory={ctx.activeCategory} onSelect={ctx.setActiveCategory} />
        <div className="h-16 md:hidden" />
      </div>
    </div>
  );
}