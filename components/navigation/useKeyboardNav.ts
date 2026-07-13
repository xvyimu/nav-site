"use client";

import {
  useCallback,
  useEffect,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { NavLink } from "@/lib/types";
import { isSafeUrl } from "@/lib/utils";
import { trackClick } from "@/lib/track-click";
import type { LinkResultItem } from "./types";

export interface KeyboardNavParams {
  flatResults: LinkResultItem[];
  rawSearch: string;
  search: string;
  activeCategory: string;
  activeTags: string[];
  totalResults: number;
  q: string;
  tabKeys: { key: string; label: string }[];
  inputRef: RefObject<HTMLInputElement | null>;
  resultsRef: RefObject<HTMLDivElement | null>;
  announceRef: RefObject<HTMLDivElement | null>;
  setRawSearch: (v: string) => void;
  setSearch: (v: string) => void;
  setServerResults: (v: NavLink[]) => void;
  setActiveCategory: (v: string) => void;
}

export interface KeyboardNavState {
  focusedIndex: number;
  setFocusedIndex: (v: number) => void;
  handleSearchKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  handleResultKeyDown: (e: KeyboardEvent<HTMLElement>, index: number) => void;
  resetFocus: () => void;
}

export function useKeyboardNav(params: KeyboardNavParams): KeyboardNavState {
  const {
    flatResults,
    rawSearch,
    search,
    activeCategory,
    activeTags,
    totalResults,
    q,
    tabKeys,
    inputRef,
    resultsRef,
    announceRef,
    setRawSearch,
    setSearch,
    setServerResults,
    setActiveCategory,
  } = params;

  const [focusedIndex, setFocusedIndex] = useState(-1);

  const resetFocus = useCallback(() => setFocusedIndex(-1), []);

  useEffect(() => {
    const handle = (e: globalThis.KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const digit = parseInt(e.key);
      if (digit >= 1 && digit <= 9 && digit <= tabKeys.length) {
        e.preventDefault();
        setActiveCategory(tabKeys[digit - 1].key);
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [tabKeys, setActiveCategory, inputRef]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetFocus();
  }, [search, activeCategory, activeTags, resetFocus]);

  useEffect(() => {
    if (announceRef.current && q) announceRef.current.textContent = `找到 ${totalResults} 个结果`;
  }, [totalResults, q, announceRef]);

  const focusResult = useCallback(
    (index: number) => {
      setFocusedIndex(index);
      // 下一帧再 focus，确保 tabIndex 已更新
      requestAnimationFrame(() => {
        const el = resultsRef.current?.querySelector<HTMLElement>(
          `[data-result-index="${index}"]`
        );
        el?.focus({ preventScroll: true });
        el?.scrollIntoView({ block: "nearest" });
      });
    },
    [resultsRef]
  );

  const handleSearchKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (flatResults.length > 0) {
            focusResult(0);
          }
          break;
        case "Escape":
          if (rawSearch) {
            setRawSearch("");
            setSearch("");
            setServerResults([]);
          } else {
            inputRef.current?.blur();
          }
          resetFocus();
          break;
      }
    },
    [flatResults.length, rawSearch, resetFocus, setRawSearch, setSearch, setServerResults, inputRef, focusResult],
  );

  const handleResultKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>, index: number) => {
      const link = flatResults[index]?.link;
      if (!link) return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (index < flatResults.length - 1) {
            focusResult(index + 1);
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (index > 0) {
            focusResult(index - 1);
          } else {
            setFocusedIndex(-1);
            inputRef.current?.focus();
          }
          break;
        case "Enter":
          e.preventDefault();
          if (isSafeUrl(link.url)) {
            window.open(link.url, "_blank", "noopener,noreferrer");
            trackClick(link.url);
          }
          break;
      }
    },
    [flatResults, inputRef, focusResult],
  );

  return {
    focusedIndex,
    setFocusedIndex,
    handleSearchKeyDown,
    handleResultKeyDown,
    resetFocus,
  };
}
