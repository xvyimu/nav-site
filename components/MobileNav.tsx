"use client";

import { getCategoryIcon } from "@/lib/category-icons";
import { cn } from "@/lib/utils";

interface MobileNavProps {
  tabs: { key: string; label: string }[];
  activeCategory: string;
  onSelect: (key: string) => void;
}

export function MobileNav({ tabs, activeCategory, onSelect }: MobileNavProps) {
  return (
    <nav
      className="fixed inset-x-3 bottom-3 z-40 overflow-hidden rounded-2xl border border-white/12 bg-[#07100f]/82 text-white shadow-[0_18px_60px_rgba(0,0,0,0.35)] [contain:layout_paint] backdrop-blur-xl md:hidden"
      role="tablist"
      aria-label="移动端导航分类"
    >
      <div className="absolute inset-x-6 -top-px h-px bg-gradient-to-r from-transparent via-emerald-200/45 to-transparent" />

      <div className="mx-auto flex w-full max-w-lg min-w-0 items-center gap-1 overflow-x-auto overscroll-x-contain px-2 py-1 scrollbar-hide">
        {tabs.map((tab) => {
          const Icon = getCategoryIcon(tab.key);
          const isActive = activeCategory === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onSelect(tab.key)}
              role="tab"
              aria-selected={isActive}
              className={cn(
                "relative flex min-w-[3.75rem] flex-col items-center gap-0.5 rounded-xl px-3 py-2.5 transition-all duration-150",
                isActive
                  ? "bg-emerald-200/12 text-emerald-50"
                  : "text-white/45 hover:bg-white/8 hover:text-white/75"
              )}
            >
              <Icon className="size-5 shrink-0" />
              <span className="max-w-full truncate text-[11px] font-medium leading-tight">
                {tab.label}
              </span>
              {isActive && (
                <span className="absolute -top-px left-1/4 right-1/4 h-0.5 rounded-full bg-emerald-200" />
              )}
            </button>
          );
        })}
      </div>

      <div className="h-safe-area-bottom" />
    </nav>
  );
}
