"use client";

import { useState, useMemo } from "react";
import { type Category, type NavLink } from "@/lib/types";
import { motion } from "motion/react";
import { SearchBar } from "./SearchBar";
import { LinkCard } from "./LinkCard";
import { staggerContainer, fadeInUp, slideDown } from "@/lib/animations";

export function Navigation({ categories, links }: { categories: Category[]; links: NavLink[] }) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let result = links;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) => l.title.toLowerCase().includes(q) || l.description?.toLowerCase().includes(q) || l.category_name?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [links, activeCategory, search]);

  const featured = filtered.filter((l) => l.featured || l.paid).sort((a, b) => {
    const aIsOfficial = a.category_slug === "big-tech" ? 0 : 1;
    const bIsOfficial = b.category_slug === "big-tech" ? 0 : 1;
    return aIsOfficial - bIsOfficial;
  });

  const officialLinks = filtered.filter((l) => l.category_slug === "big-tech");
  const relayLinks = filtered.filter((l) => l.category_slug === "free-relay");
  const modelLinks = filtered.filter((l) => l.category_slug === "model-ranking");

<<<<<<< HEAD
  // Tab label mapping (friendly names)
=======
  // 板块Tab标签映射（用友好名称替代数据库原始名称）
>>>>>>> e9e83db (feat: P1 complete + model ranking update + cleanup)
  const sectionLabels: Record<string, string> = {
    "big-tech": "官方 API",
    "free-relay": "中转服务站",
    "model-ranking": "模型排行榜",
  };

<<<<<<< HEAD
  const tabs = [
    { key: "all", label: "全部" },
    ...categories.map((c) => ({ key: c.slug, label: sectionLabels[c.slug] || c.name })),
  ];

  const linkSections = [
    { key: "big-tech", links: officialLinks, label: "官方 API", accent: "text-primary" },
    { key: "free-relay", links: relayLinks, label: "中转服务站", accent: "text-amber-600/70" },
    { key: "model-ranking", links: modelLinks, label: "模型排行榜", accent: "text-purple-600/70" },
=======
  const sectionTabs = [
    { key: "all", label: "全部" },
    ...categories.map((c) => ({
      key: c.slug,
      label: sectionLabels[c.slug] || c.name,
    })),
>>>>>>> e9e83db (feat: P1 complete + model ranking update + cleanup)
  ];

  return (
    <motion.div className="space-y-8" variants={staggerContainer} initial="hidden" animate="show">
      <motion.div variants={slideDown}>
        <SearchBar value={search} onChange={setSearch} />
      </motion.div>

<<<<<<< HEAD
      {/* Single row of clean text tabs */}
=======
      {/* 板块Tab — 合并了分类筛选的功能 */}
>>>>>>> e9e83db (feat: P1 complete + model ranking update + cleanup)
      <motion.div variants={fadeInUp} className="flex items-center gap-1 border-b border-border pb-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveCategory(tab.key)}
            className={`px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors relative ${
              activeCategory === tab.key ? "text-foreground" : "text-muted-foreground/50 hover:text-foreground/70"
            }`}
          >
            {tab.label}
            {activeCategory === tab.key && (
<<<<<<< HEAD
              <motion.div layoutId="section-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" transition={{ type: "spring", stiffness: 380, damping: 30 }} />
=======
              <motion.div
                layoutId="section-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
>>>>>>> e9e83db (feat: P1 complete + model ranking update + cleanup)
            )}
          </button>
        ))}
      </motion.div>

      <motion.p className="text-xs text-muted-foreground/50" variants={fadeInUp}>
        {filtered.length === 0 ? "没有找到匹配的工具" : `共 ${filtered.length} 个`}
      </motion.p>

<<<<<<< HEAD
      {featured.length > 0 && activeCategory === "all" && (
=======
      {featuredSorted.length > 0 && activeCategory === "all" && (
>>>>>>> e9e83db (feat: P1 complete + model ranking update + cleanup)
        <motion.section variants={fadeInUp}>
          <h2 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground/50 flex items-center gap-2">
            <span className="inline-block w-4 h-px bg-primary/40" />推荐
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((link, i) => <LinkCard key={link.id} link={link} index={i} />)}
          </div>
        </motion.section>
      )}

<<<<<<< HEAD
      {linkSections.map((section) =>
        section.links.length > 0 && (activeCategory === "all" || activeCategory === section.key) ? (
          <motion.section key={section.key} variants={fadeInUp}>
            {activeCategory === "all" && (
              <h2 className={`mb-4 text-xs font-medium uppercase tracking-widest ${section.accent} flex items-center gap-2`}>
                <span className="inline-block w-4 h-px bg-current opacity-40" />{section.label}
              </h2>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.links.map((link, i) => <LinkCard key={link.id} link={link} index={i} />)}
            </div>
          </motion.section>
        ) : null
=======
      {officialLinks.length > 0 && (activeCategory === "all" || activeCategory === "big-tech") && (
        <motion.section variants={fadeInUp}>
          {activeCategory === "all" && (
            <h2 className="mb-4 text-xs font-medium uppercase tracking-widest text-primary flex items-center gap-2">
              <span className="inline-block w-4 h-px bg-primary/40" />官方 API
            </h2>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {officialLinks.map((link, i) => <LinkCard key={link.id} link={link} index={i} />)}
          </div>
        </motion.section>
      )}

      {relayLinks.length > 0 && (activeCategory === "all" || activeCategory === "free-relay") && (
        <motion.section variants={fadeInUp}>
          {activeCategory === "all" && (
            <h2 className="mb-4 text-xs font-medium uppercase tracking-widest text-amber-600/70 flex items-center gap-2">
              <span className="inline-block w-4 h-px bg-amber-300" />中转服务站
            </h2>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {relayLinks.map((link, i) => <LinkCard key={link.id} link={link} index={i} />)}
          </div>
        </motion.section>
      )}

      {modelLinks.length > 0 && (activeCategory === "all" || activeCategory === "model-ranking") && (
        <motion.section variants={fadeInUp}>
          {activeCategory === "all" && (
            <h2 className="mb-4 text-xs font-medium uppercase tracking-widest text-purple-600/70 flex items-center gap-2">
              <span className="inline-block w-4 h-px bg-purple-400" />模型排行榜
            </h2>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modelLinks.map((link, i) => <LinkCard key={link.id} link={link} index={i} />)}
          </div>
        </motion.section>
>>>>>>> e9e83db (feat: P1 complete + model ranking update + cleanup)
      )}

      {filtered.length === 0 && (
        <motion.div className="flex flex-col items-center gap-3 py-20 text-muted-foreground/40" variants={fadeInUp}>
          <span className="text-3xl">🔍</span>
          <p className="text-sm">没有找到匹配的工具</p>
<<<<<<< HEAD
          <button onClick={() => { setSearch(""); setActiveCategory("all"); }} className="text-xs text-muted-foreground/50 hover:text-muted-foreground/80 underline-offset-2 underline transition-colors">
=======
          <button onClick={() => { setSearch(""); setActiveCategory("all"); }}
            className="text-xs text-muted-foreground/50 hover:text-muted-foreground/80 underline-offset-2 underline transition-colors">
>>>>>>> e9e83db (feat: P1 complete + model ranking update + cleanup)
            清除筛选
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}