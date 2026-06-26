"use client";

import { type KeyboardEvent } from "react";
import { type NavLink } from "@/lib/types";
import { motion } from "motion/react";
import { fadeInUp } from "@/lib/animations";
import { ResultGrid } from "./ResultGrid";

interface CategorySectionConfig {
  key: string;
  links: NavLink[];
  label: string;
  accent: string;
}

interface CategorySectionProps {
  section: CategorySectionConfig;
  sectionOffset: number;
  activeCategory: string;
  focusedIndex: number;
  onFocusChange: (index: number) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>, index: number) => void;
  searchQuery?: string;
}

export function CategorySection({
  section,
  sectionOffset,
  activeCategory,
  focusedIndex,
  onFocusChange,
  onKeyDown,
  searchQuery = "",
}: CategorySectionProps) {
  if (section.links.length === 0) return null;
  if (activeCategory !== "all" && activeCategory !== section.key) return null;

  return (
    <motion.section variants={fadeInUp}>
      {activeCategory === "all" && (
        <h2 className={`mb-3 text-xs font-medium uppercase tracking-widest ${section.accent} flex items-center gap-2`}>
          <span className="inline-block w-4 h-px bg-current opacity-50" />
          {section.label}
          <span className="text-muted-foreground/60 font-normal tabular-nums">({section.links.length})</span>
        </h2>
      )}
      <ResultGrid
        links={section.links}
        baseIndex={sectionOffset}
        focusedIndex={focusedIndex}
        onFocusChange={onFocusChange}
        onKeyDown={onKeyDown}
        searchQuery={searchQuery}
      />
    </motion.section>
  );
}