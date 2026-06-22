"use client";

import { useState, useMemo, useRef, useCallback, useEffect, type KeyboardEvent } from "react";
import { type NavLink, type Category } from "@/lib/types";
import type { ModelRanking } from "./ModelRanking";
import Fuse from "fuse.js";

type SortMode = "default" | "newest" | "popular";

/** Fuse.js fuzzy search options */
function createFuse<T>(list: T[], keys: { name: string; weight: number }[]) {
  return new Fuse(list, {
    keys,
    threshold: 0.4,
    distance: 100,
    minMatchCharLength: 1,
    includeScore: true,
  });
}

/** Safe URL check */
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function useLinksFilter({
  categories,
  links,
  modelRankings,
}: {
  categories: Category[];
  links: NavLink[];
  modelRankings: ModelRanking[];
}) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [rawSearch, setRawSearch] = useState("");
  const [search, setSearch] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("nav-sort-mode");
      if (saved === "newest" || saved === "popular") return saved;
    }
    return "default";
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const announceRef = useRef<HTMLDivElement>(null);

  // ── Tab keys ──
  const sectionLabels: Record<string, string> = {
    "big-tech": "官方 API",
    "free-relay": "中转服务站",
    "model-ranking": "模型排行榜",
  };

  const tabKeys = useMemo(
    () => [
      { key: "all", label: "全部" },
      ...categories.map((c) => ({ key: c.slug, label: sectionLabels[c.slug] || c.name })),
    ],
    [categories],
  );

  const tabCounts = useMemo(
    () => tabKeys.map((tab) => ({
      ...tab,
      count: tab.key === "all" ? links.length : links.filter((l) => l.category_slug === tab.key).length,
    })),
    [tabKeys, links],
  );

  // ── Immediate search (skip debounce) ──
  const handleImmediateSearch = useCallback((term: string) => {
    setRawSearch(term);
    setSearch(term.trim().toLowerCase());
  }, []);

  // ── Persist sort ──
  useEffect(() => { localStorage.setItem("nav-sort-mode", sortMode); }, [sortMode]);

  // ── Debounce: 200ms ──
  useEffect(() => {
    const timer = setTimeout(() => setSearch(rawSearch), 200);
    return () => clearTimeout(timer);
  }, [rawSearch]);

  // ── ⌘1-4: switch categories ──
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
  }, [tabKeys]);

  const q = search.trim().toLowerCase();

  // ── Fuse.js ──
  const fuse = useMemo(
    () => createFuse(links, [
      { name: "title", weight: 2 },
      { name: "description", weight: 1 },
      { name: "category_name", weight: 0.8 },
    ]),
    [links],
  );

  // ── Filtered + sorted ──
  const filtered = useMemo(() => {
    let pool = activeCategory === "all" ? links : links.filter((l) => l.category_slug === activeCategory);
    let scoreMap: Map<string, number> | null = null;

    if (q) {
      const raw = fuse.search(q);
      const fuzzyIds = new Set(raw.map((r) => r.item.id));
      pool = pool.filter((l) => fuzzyIds.has(l.id));
      scoreMap = new Map(raw.map((r) => [r.item.id, r.score ?? 1]));
    }

    if (sortMode === "newest") {
      pool = [...pool].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortMode === "popular") {
      pool = [...pool].sort((a, b) => b.click_count - a.click_count);
    } else if (q && scoreMap) {
      pool.sort((a, b) => (scoreMap.get(a.id) ?? 1) - (scoreMap.get(b.id) ?? 1));
    }

    return pool;
  }, [links, activeCategory, search, fuse, q, sortMode]);

  // ── Featured (fixed sort comparator) ──
  const featured = useMemo(
    () =>
      activeCategory === "all" && !q
        ? filtered.filter((l) => l.featured || l.paid).sort((a, b) => {
            if (a.category_slug === "big-tech" && b.category_slug !== "big-tech") return -1;
            if (a.category_slug !== "big-tech" && b.category_slug === "big-tech") return 1;
            return 0;
          })
        : [],
    [filtered, activeCategory, q],
  );

  // ── Latest / popular ──
  const latest = useMemo(() => {
    if (activeCategory !== "all" || q) return [];
    if (sortMode === "newest") return [];
    if (sortMode === "popular") {
      return [...links]
        .sort((a, b) => b.click_count - a.click_count)
        .filter((l) => !l.featured && !l.paid)
        .slice(0, 6);
    }
    return [...links]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 6);
  }, [links, activeCategory, q, sortMode]);

  const officialLinks = useMemo(() => filtered.filter((l) => l.category_slug === "big-tech"), [filtered]);
  const relayLinks = useMemo(() => filtered.filter((l) => l.category_slug === "free-relay"), [filtered]);

  // ── Current label ──
  const currentLabel = useMemo(
    () => tabKeys.find((t) => t.key === activeCategory)?.label ?? "全部",
    [tabKeys, activeCategory],
  );

  // ── Filtered rankings ──
  const filteredRankings = useMemo(() => {
    if (!q) return modelRankings;
    const fuseR = createFuse(modelRankings, [
      { name: "model_name", weight: 2 },
      { name: "description", weight: 1 },
      { name: "source", weight: 0.5 },
    ]);
    return fuseR.search(q).map((r) => r.item);
  }, [modelRankings, q]);

  const showNonFeatured = (items: NavLink[]) =>
    activeCategory === "all" && !q ? items.filter((l) => !l.featured && !l.paid) : items;

  const linkSections = [
    { key: "big-tech", links: showNonFeatured(officialLinks), label: "官方 API", accent: "text-primary" },
    { key: "free-relay", links: showNonFeatured(relayLinks), label: "中转服务站", accent: "text-amber-600/70" },
  ];

  const showRankings =
    (activeCategory === "all" || activeCategory === "model-ranking") && filteredRankings.length > 0;
  const showLinks = activeCategory !== "model-ranking";

  // ── Flat results for keyboard nav ──
  const flatResults = useMemo(() => {
    const items: { type: "link"; link: NavLink }[] = [];
    if (showLinks) {
      if (featured.length > 0) featured.forEach((l) => items.push({ type: "link", link: l }));
      if (latest.length > 0) latest.forEach((l) => items.push({ type: "link", link: l }));
      for (const section of linkSections) {
        if (section.links.length > 0 && (activeCategory === "all" || activeCategory === section.key)) {
          section.links.forEach((l) => items.push({ type: "link", link: l }));
        }
      }
    }
    return items;
  }, [showLinks, featured, linkSections, activeCategory]);

  const totalResults = flatResults.length + (showRankings ? filteredRankings.length : 0);
  const hasResults = totalResults > 0;

  // ── Keyboard navigation ──
  const resetFocus = useCallback(() => setFocusedIndex(-1), []);

  const handleSearchKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (flatResults.length > 0) {
            setFocusedIndex(0);
            resultsRef.current?.querySelector<HTMLElement>('[data-result-index="0"]')?.scrollIntoView({ block: "nearest" });
          }
          break;
        case "Escape":
          if (rawSearch) { setRawSearch(""); setSearch(""); }
          else inputRef.current?.blur();
          resetFocus();
          break;
      }
    },
    [flatResults.length, rawSearch, resetFocus],
  );

  const handleResultKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>, index: number) => {
      const link = flatResults[index]?.link;
      if (!link) return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (index < flatResults.length - 1) {
            setFocusedIndex(index + 1);
            resultsRef.current?.querySelector<HTMLElement>(`[data-result-index="${index + 1}"]`)?.scrollIntoView({ block: "nearest" });
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (index > 0) {
            setFocusedIndex(index - 1);
            resultsRef.current?.querySelector<HTMLElement>(`[data-result-index="${index - 1}"]`)?.scrollIntoView({ block: "nearest" });
          } else {
            setFocusedIndex(-1);
            inputRef.current?.focus();
          }
          break;
        case "Enter":
          e.preventDefault();
          if (isSafeUrl(link.url)) {
            window.open(link.url, "_blank", "noopener,noreferrer");
            navigator.sendBeacon(
              "/api/click",
              new Blob([JSON.stringify({ url: link.url })], { type: "application/json" }),
            );
          }
          break;
      }
    },
    [flatResults],
  );

  useEffect(() => { resetFocus(); }, [search, activeCategory, resetFocus]);

  useEffect(() => {
    if (announceRef.current && q) announceRef.current.textContent = `找到 ${totalResults} 个结果`;
  }, [totalResults, q]);

  return {
    // State
    activeCategory, setActiveCategory,
    rawSearch, setRawSearch,
    search, setSearch,
    focusedIndex, setFocusedIndex,
    sortMode, setSortMode,
    q,

    // Refs
    inputRef,
    resultsRef,
    announceRef,

    // Tab data
    tabKeys,
    tabCounts,
    currentLabel,

    // Derived data
    filtered,
    featured,
    latest,
    linkSections,
    showRankings,
    showLinks,
    filteredRankings,
    flatResults,
    totalResults,
    hasResults,

    // Handlers
    handleImmediateSearch,
    handleSearchKeyDown,
    handleResultKeyDown,
    resetFocus,
  };
}