import { type KeyboardEvent } from "react";
import { type NavLink } from "@/lib/types";
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
  onPreview?: (link: NavLink) => void;
}

export function CategorySection({
  section,
  sectionOffset,
  activeCategory,
  focusedIndex,
  onFocusChange,
  onKeyDown,
  searchQuery = "",
  onPreview,
}: CategorySectionProps) {
  if (section.links.length === 0) return null;
  const isSearchSection = section.key === "search-results" || section.key === "zero-result-recommendations";
  if (!isSearchSection && activeCategory !== "all" && activeCategory !== section.key) return null;

  return (
    <section className="animate-fade-in-up">
      {(activeCategory === "all" || isSearchSection) && (
        <h2 className={`atlas-section-label ${section.accent || "text-white/78"}`}>
          {section.label}
          <span className="font-normal tabular-nums text-white/42">({section.links.length})</span>
        </h2>
      )}
      <ResultGrid
        links={section.links}
        baseIndex={sectionOffset}
        focusedIndex={focusedIndex}
        onFocusChange={onFocusChange}
        onKeyDown={onKeyDown}
        searchQuery={searchQuery}
        onPreview={onPreview}
      />
    </section>
  );
}
