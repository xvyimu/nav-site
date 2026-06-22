"use client";

import { type KeyboardEvent } from "react";
import { type NavLink } from "@/lib/types";
import { motion } from "motion/react";
import { fadeInUp } from "@/lib/animations";
import { LinkCard } from "./LinkCard";

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
}

export function CategorySection({
  section,
  sectionOffset,
  activeCategory,
  focusedIndex,
  onFocusChange,
  onKeyDown,
}: CategorySectionProps) {
  if (section.links.length === 0) return null;
  if (activeCategory !== "all" && activeCategory !== section.key) return null;

  return (
    <motion.section variants={fadeInUp}>
      {activeCategory === "all" && (
        <h2 className={`mb-3 text-xs font-medium uppercase tracking-widest ${section.accent} flex items-center gap-2`}>
          <span className="inline-block w-4 h-px bg-current opacity-40" />
          {section.label}
          <span className="text-muted-foreground/40 font-normal">({section.links.length})</span>
        </h2>
      )}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" role="list" aria-label={section.label}>
        {section.links.map((link, i) => {
          const resultIndex = sectionOffset + i;
          return (
            <motion.div layout key={link.id}
              id={`result-${resultIndex}`}
              role="listitem"
              data-result-index={resultIndex}
              data-focused={focusedIndex === resultIndex ? "true" : undefined}
              onMouseEnter={() => onFocusChange(resultIndex)}
              onMouseLeave={() => onFocusChange(-1)}
              onKeyDown={(e) => onKeyDown(e, resultIndex)}
              tabIndex={focusedIndex === resultIndex ? 0 : -1}
              className="outline-none rounded-xl transition-all duration-150"
            >
              <LinkCard link={link} index={resultIndex} />
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}