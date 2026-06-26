"use client";

import { getCategoryIcon } from "@/lib/category-icons";

interface MobileNavProps {
  tabs: { key: string; label: string }[];
  activeCategory: string;
  onSelect: (key: string) => void;
}

export function MobileNav({ tabs, activeCategory, onSelect }: MobileNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/50 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 md:hidden"
      role="tablist"
      aria-label="导航分类（移动端）"
    >
      {/* 顶部光晕 */}
      <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

      <div className="flex items-center gap-1 px-2 py-1 max-w-lg mx-auto overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => {
          const Icon = getCategoryIcon(tab.key);
          const isActive = activeCategory === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onSelect(tab.key)}
              role="tab"
              aria-selected={isActive}
              className={`relative flex flex-col items-center gap-0.5 py-2.5 px-3 rounded-lg transition-all duration-150 min-w-0 ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground/50 hover:text-muted-foreground/75"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="text-[11px] font-medium leading-tight truncate max-w-full">
                {tab.label}
              </span>
              {isActive && (
                <span className="absolute -top-px left-1/4 right-1/4 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* iOS safe area padding */}
      <div className="h-safe-area-bottom" />
    </nav>
  );
}
