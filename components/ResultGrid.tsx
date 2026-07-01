"use client";

import { type KeyboardEvent } from "react";
import { type NavLink } from "@/lib/types";
import { LinkCard } from "./LinkCard";

interface ResultGridProps {
  links: NavLink[];
  baseIndex: number;
  focusedIndex: number;
  onFocusChange: (index: number) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>, index: number) => void;
  searchQuery?: string;
  onPreview?: (link: NavLink) => void;
}

/**
 * 可键盘导航的链接卡片网格
 *
 * 被 DualTrackSection 和 CategorySection 复用，消除 ~80 行重复代码。
 *
 * 性能：不使用 motion `layout` prop。首屏默认态会挂载 ~513 张卡片，
 * `layout` 会对每个元素做 FLIP 测量（getBoundingClientRect），513 个并发触发
 * 强制同步重排，是首屏 TBT / Style&Layout 的主要来源（见 docs/perf/findings.md H2/H5）。
 * 入场动画由 LinkCard 的 CSS fadeInUp 承担
 */
export function ResultGrid({
  links,
  baseIndex,
  focusedIndex,
  onFocusChange,
  onKeyDown,
  searchQuery = "",
  onPreview,
}: ResultGridProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" role="list">
      {links.map((link, i) => {
        const idx = baseIndex + i;
        return (
          <div
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
            <LinkCard link={link} index={idx} searchQuery={searchQuery} onPreview={onPreview} />
          </div>
        );
      })}
    </div>
  );
}
