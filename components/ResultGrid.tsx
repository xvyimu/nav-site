"use client";

import { type KeyboardEvent } from "react";
import { type NavLink } from "@/lib/types";
import { motion } from "motion/react";
import { LinkCard } from "./LinkCard";

interface ResultGridProps {
  links: NavLink[];
  baseIndex: number;
  focusedIndex: number;
  onFocusChange: (index: number) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>, index: number) => void;
  searchQuery?: string;
}

/**
 * 可键盘导航的链接卡片网格
 *
 * 被 DualTrackSection 和 CategorySection 复用，消除 ~80 行重复代码。
 */
export function ResultGrid({
  links,
  baseIndex,
  focusedIndex,
  onFocusChange,
  onKeyDown,
  searchQuery = "",
}: ResultGridProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" role="list">
      {links.map((link, i) => {
        const idx = baseIndex + i;
        return (
          <motion.div
            layout
            key={link.id}
            id={`result-${idx}`}
            role="listitem"
            data-result-index={idx}
            data-focused={focusedIndex === idx ? "true" : undefined}
            onMouseEnter={() => onFocusChange(idx)}
            onMouseLeave={() => onFocusChange(-1)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            tabIndex={focusedIndex === idx ? 0 : -1}
            className="outline-none rounded-xl transition-all duration-150"
          >
            <LinkCard link={link} index={idx} searchQuery={searchQuery} />
          </motion.div>
        );
      })}
    </div>
  );
}