"use client";

import { useState, useMemo } from "react";
import { type Category, type NavLink } from "@/lib/types";
import { motion } from "motion/react";
import { CategoryFilter } from "./CategoryFilter";
import { SearchBar } from "./SearchBar";
import { LinkCard } from "./LinkCard";
import { staggerContainer, fadeInUp, slideDown } from "@/lib/animations";

export function Navigation({
  categories,
  links,
}: {
  categories: Category[];
  links: NavLink[];
}) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState<"all" | "official" | "relay">("all");

  const filtered = useMemo(() => {
    let result = links;

    if (activeCategory !== "all") {
      result = result.filter((l) => l.category_slug === activeCategory);
    }
    if (activeSection === "official") {
      result = result.filter((l) => l.category_slug === "big-tech" || l.category_slug === "oss-model");
    }
    if (activeSection === "relay") {
      result = result.filter((l) => l.category_slug === "free-relay" || l.category_slug === "gpu");
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          l.description?.toLowerCase().includes(q) ||
          l.category_name?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [links, activeCategory, search, activeSection]);

  // Split by type for sections
  const featured = filtered.filter((l) => l.featured || l.paid);
  const officialLinks = filtered.filter((l) => l.category_slug === "big-tech");
  const relayLinks = filtered.filter((l) => l.category_slug === "free-relay" || l.category_slug === "gpu");
  const otherLinks = filtered.filter(
    (l) => l.category_slug !== "big-tech" && l.category_slug !== "free-relay" && l.category_slug !== "gpu" && !(l.featured || l.paid)
  );

  // Featured: official first, then relay
  const featuredSorted = [...featured].sort((a, b) => {
    const aIsOfficial = a.category_slug === "big-tech" ? 0 : 1;
    const bIsOfficial = b.category_slug === "big-tech" ? 0 : 1;
    return aIsOfficial - bIsOfficial;
  });

  const sectionTabs = [
    { key: "all", label: "全部" },
    { key: "official", label: "官方 API" },
    { key: "relay", label: "中转服务站" },
  ] as const;

  return (
    <motion.div
      className="space-y-8"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      {/* Search */}
      <motion.div variants={slideDown}>
        <SearchBar value={search} onChange={setSearch} />
      </motion.div>

      {/* Section tabs */}
      <motion.div variants={fadeInUp} className="flex items-center gap-1 border-b border-border pb-1">
        {sectionTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSection(tab.key)}
            className={`px-3 py-1.5 text-sm font-medium transition-colors relative ${
              activeSection === tab.key
                ? "text-foreground"
                : "text-muted-foreground/50 hover:text-foreground/70"
            }`}
          >
            {tab.label}
            {activeSection === tab.key && (
              <motion.div
                layoutId="section-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
          </button>
        ))}
      </motion.div>

      {/* Categories */}
      <motion.div variants={fadeInUp}>
        <CategoryFilter
          categories={categories}
          active={activeCategory}
          onChange={setActiveCategory}
        />
      </motion.div>

      {/* Results count */}
      <motion.p className="text-xs text-muted-foreground/50" variants={fadeInUp}>
        {filtered.length === 0 ? "没有找到匹配的工具" : `共 ${filtered.length} 个`}
      </motion.p>

      {/* Featured */}
      {featuredSorted.length > 0 && (
        <motion.section variants={fadeInUp}>
          <h2 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground/50 flex items-center gap-2">
            <span className="inline-block w-4 h-px bg-primary/40" />
            推荐
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featuredSorted.map((link, i) => (
              <LinkCard key={link.id} link={link} index={i} />
            ))}
          </div>
        </motion.section>
      )}

      {/* Official API */}
      {officialLinks.length > 0 && (
        <motion.section variants={fadeInUp}>
          <h2 className="mb-4 text-xs font-medium uppercase tracking-widest text-primary flex items-center gap-2">
            <span className="inline-block w-4 h-px bg-primary/40" />
            官方 API
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {officialLinks.map((link, i) => (
              <LinkCard key={link.id} link={link} index={i} />
            ))}
          </div>
        </motion.section>
      )}

      {/* 中转服务站 */}
      {relayLinks.length > 0 && (
        <motion.section variants={fadeInUp}>
          <h2 className="mb-4 text-xs font-medium uppercase tracking-widest text-amber-600/70 flex items-center gap-2">
            <span className="inline-block w-4 h-px bg-amber-300" />
            中转服务站
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {relayLinks.map((link, i) => (
              <LinkCard key={link.id} link={link} index={i} />
            ))}
          </div>
        </motion.section>
      )}

      {/* Other categories */}
      {otherLinks.length > 0 && (
        <motion.section variants={fadeInUp}>
          <h2 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground/50 flex items-center gap-2">
            <span className="inline-block w-4 h-px bg-muted-foreground/30" />
            其他
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {otherLinks.map((link, i) => (
              <LinkCard key={link.id} link={link} index={i} />
            ))}
          </div>
        </motion.section>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <motion.div className="flex flex-col items-center gap-3 py-20 text-muted-foreground/40" variants={fadeInUp}>
          <span className="text-3xl">🔍</span>
          <p className="text-sm">没有找到匹配的工具</p>
          <button
            onClick={() => { setSearch(""); setActiveCategory("all"); setActiveSection("all"); }}
            className="text-xs text-muted-foreground/50 hover:text-muted-foreground/80 underline-offset-2 underline transition-colors"
          >
            清除筛选
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}
