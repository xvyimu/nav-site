"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { type NavLink } from "@/lib/types";
import { extractDomain, isSafeUrl } from "@/lib/utils";
import { prefetchFavicons } from "@/lib/use-favicon";
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

const DEFAULT_INITIAL = 24;
const DEFAULT_PAGE = 24;

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
  const listKey = useMemo(
    () =>
      `${baseIndex}:${links.length}:${links[0]?.id ?? ""}:${links[links.length - 1]?.id ?? ""}`,
    [baseIndex, links]
  );

  // listKey 变化时 remount 内层，重置 visibleCount，避免 effect setState
  return (
    <ResultGridInner
      key={listKey}
      links={links}
      baseIndex={baseIndex}
      focusedIndex={focusedIndex}
      onFocusChange={onFocusChange}
      onKeyDown={onKeyDown}
      searchQuery={searchQuery}
      onPreview={onPreview}
      initialVisible={initialVisible}
      pageSize={pageSize}
    />
  );
}

function ResultGridInner({
  links,
  baseIndex,
  focusedIndex,
  onKeyDown,
  searchQuery = "",
  onPreview,
  initialVisible = DEFAULT_INITIAL,
  pageSize = DEFAULT_PAGE,
}: ResultGridProps) {
  const [visibleCount, setVisibleCount] = useState(initialVisible);
  const rootRef = useRef<HTMLDivElement>(null);
  const focusedLocalIndex = focusedIndex - baseIndex;
  const focusRequiredCount =
    focusedLocalIndex >= 0 && focusedLocalIndex < links.length
      ? focusedLocalIndex + 1
      : 0;
  const effectiveVisibleCount = Math.max(visibleCount, focusRequiredCount);
  const visible = links.slice(0, effectiveVisibleCount);
  const hasMore = effectiveVisibleCount < links.length;

  // 可见切片就绪后预热域名 favicon（跳过已有安全 icon 的链接）
  useEffect(() => {
    if (effectiveVisibleCount <= 0 || links.length === 0) return;
    const slice = links.slice(0, effectiveVisibleCount);
    const domains = slice.map((link) => {
      if (typeof link.icon === "string" && isSafeUrl(link.icon)) return null;
      return extractDomain(link.url);
    });
    prefetchFavicons(domains);
  }, [links, effectiveVisibleCount]);

  useEffect(() => {
    if (visibleCount > 0 || links.length === 0) return;
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") {
      setVisibleCount(Math.min(pageSize, links.length));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisibleCount(Math.min(pageSize, links.length));
        observer.disconnect();
      },
      { rootMargin: "240px 0px" }
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [links.length, pageSize, visibleCount]);

  return (
    <div ref={rootRef} className="space-y-3">
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
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                onKeyDown(e, idx);
              }}
              tabIndex={isFocused ? 0 : -1}
              className="outline-none rounded-xl transition-all duration-150"
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
              setVisibleCount((c) =>
                Math.min(Math.max(c, focusRequiredCount) + pageSize, links.length)
              )
            }
          >
            加载更多（{links.length - effectiveVisibleCount}）
          </Button>
        </div>
      )}
    </div>
  );
}
