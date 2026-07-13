"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { type NavLink } from "@/lib/types";
import { LinkCard } from "./LinkCard";
import { Button } from "@/components/ui/button";

interface ResultGridProps {
  links: NavLink[];
  baseIndex: number;
  focusedIndex: number;
  onFocusChange: (index: number) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>, index: number) => void;
  searchQuery?: string;
  onPreview?: (link: NavLink) => void;
  /** 首屏窗口大小；超出后「加载更多」 */
  initialVisible?: number;
  pageSize?: number;
}

const DEFAULT_INITIAL = 40;
const DEFAULT_PAGE = 40;

/**
 * 可键盘导航的链接卡片网格 + 渐进挂载（降低首屏 DOM/favicon 扇出）。
 */
export function ResultGrid({
  links,
  baseIndex,
  focusedIndex,
  onFocusChange,
  onKeyDown,
  searchQuery = "",
  onPreview,
  initialVisible = DEFAULT_INITIAL,
  pageSize = DEFAULT_PAGE,
}: ResultGridProps) {
  const [visibleCount, setVisibleCount] = useState(initialVisible);

  // 列表身份变化时重置窗口（分类/搜索切换）
  const listKey = useMemo(
    () => `${baseIndex}:${links.length}:${links[0]?.id ?? ""}:${links[links.length - 1]?.id ?? ""}`,
    [baseIndex, links]
  );

  useEffect(() => {
    setVisibleCount(initialVisible);
  }, [listKey, initialVisible]);

  const visible = links.slice(0, visibleCount);
  const hasMore = visibleCount < links.length;

  return (
    <div className="space-y-3">
      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
        role="list"
      >
        {visible.map((link, i) => {
          const idx = baseIndex + i;
          const isFocused = focusedIndex === idx;
          return (
            <div
              key={link.id}
              id={`result-${idx}`}
              role="listitem"
              data-result-index={idx}
              data-focused={isFocused ? "true" : undefined}
              onKeyDown={(e) => onKeyDown(e, idx)}
              tabIndex={isFocused ? 0 : -1}
              className="outline-none rounded-xl transition-all duration-150"
              // 不用 hover 写全局 focusedIndex，避免数百卡重渲染
            >
              <LinkCard
                link={link}
                index={idx}
                searchQuery={searchQuery}
                onPreview={onPreview}
              />
            </div>
          );
        })}
      </div>
      {hasMore && (
        <div className="flex justify-center pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setVisibleCount((c) => Math.min(c + pageSize, links.length))
            }
          >
            加载更多（{links.length - visibleCount}）
          </Button>
        </div>
      )}
    </div>
  );
}
