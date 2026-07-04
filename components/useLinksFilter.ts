"use client";

import { useState, useMemo, useRef, useCallback, useEffect, type KeyboardEvent, type RefObject } from "react";
import type { NavLink, Category, Tag } from "@/lib/types";
import { SECTION_LABELS } from "@/lib/nav-config";
import { isSafeUrl } from "@/lib/utils";
import { trackClick } from "@/lib/track-click";
import { getDescendantSlugs } from "@/lib/category-tree";
import type {
  PopularityFilter,
  SearchFacets,
  SearchSuggestion,
} from "@/lib/search-experience";
import { buildSearchFacets, buildSearchSuggestions } from "@/lib/search-experience";
import {
  buildTabCounts as clientTabCounts,
  buildTabTree as clientTabTree,
  buildAvailableTags as clientAvailableTags,
  type SidebarTabNode,
  type PrecomputedNavData,
} from "@/lib/nav-derived-data";

// ════════════════════════════════════════════════════════════
//  共享类型与工具函数（纯函数已迁移到 lib/nav-derived-data.ts）
// ════════════════════════════════════════════════════════════

type SortMode = "default" | "newest" | "popular";

const EMPTY_SEARCH_FACETS: SearchFacets = {
  categories: [],
  tags: [],
  ratings: [],
  popularity: [],
};

/**
 * URL ↔ 筛选状态双向同步
 *
 * 参数命名（与 API、JSON-LD、tool 页回链统一）：
 *   q          搜索词（对应 layout.tsx 的 SearchAction urlTemplate）
 *   cat        分类 slug（对应 tool/[slug]/page.tsx 的 /?cat= 链接）
 *   tag        标签 slug，逗号分隔（对应 /api/search 的 tag 参数）
 *   minRating  1-5
 *   popularity featured | popular
 *   semantic   false 时才写入 URL（默认 true，保持 URL 简洁）
 *
 * 策略：
 *   - 挂载时从 URL 读取初始值（lazy initializer）
 *   - state 变化 → window.history.replaceState（不触发 popstate，无 re-render）
 *   - 浏览器前进/后退 → popstate → 重新 setState
 *   - 搜索词同步的是 debounce 后的 `search` 而非 `rawSearch`，避免每次按键都改 URL
 */
interface ParsedUrlFilters {
  q: string;
  cat: string;
  tags: string[];
  minRating: number | null;
  popularity: PopularityFilter | null;
  semantic: boolean;
}

function parseFiltersFromUrl(sp: URLSearchParams): ParsedUrlFilters {
  const q = sp.get("q")?.trim() ?? "";
  const catRaw = sp.get("cat")?.trim() || "all";
  const cat = catRaw === "model-ranking" ? "all" : catRaw;
  const tags = sp
    .getAll("tag")
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
  const minRatingRaw = sp.get("minRating");
  const minRatingNum = minRatingRaw ? Number(minRatingRaw) : null;
  const minRating =
    minRatingNum !== null &&
    Number.isFinite(minRatingNum) &&
    minRatingNum >= 1 &&
    minRatingNum <= 5
      ? minRatingNum
      : null;
  const popularityRaw = sp.get("popularity");
  const popularity: PopularityFilter | null =
    popularityRaw === "featured" || popularityRaw === "popular" ? popularityRaw : null;
  const semantic = sp.get("semantic") !== "false"; // 默认 true
  return { q, cat, tags, minRating, popularity, semantic };
}

function readInitialFilters(): ParsedUrlFilters {
  if (typeof window === "undefined") {
    return { q: "", cat: "all", tags: [], minRating: null, popularity: null, semantic: true };
  }
  return parseFiltersFromUrl(new URLSearchParams(window.location.search));
}

// ════════════════════════════════════════════════════════════
//  Hook 1: useFilterState — 筛选状态 + URL 双向同步
// ════════════════════════════════════════════════════════════

interface FilterState {
  activeCategory: string;
  rawSearch: string;
  search: string;
  semanticSearch: boolean;
  activeTags: string[];
  sortMode: SortMode;
  minRatingFilter: number | null;
  popularityFilter: PopularityFilter | null;
  setActiveCategory: (v: string) => void;
  setRawSearch: (v: string) => void;
  setSearch: (v: string) => void;
  setSemanticSearch: (v: boolean) => void;
  setSortMode: (v: SortMode) => void;
  setMinRatingFilter: (v: number | null) => void;
  setPopularityFilter: (v: PopularityFilter | null) => void;
  toggleTag: (slug: string) => void;
  clearTags: () => void;
  clearSearchExperienceFilters: () => void;
}

function useFilterState(): FilterState {
  const [initial] = useState(readInitialFilters);
  const [activeCategory, setActiveCategory] = useState(initial.cat);
  const [rawSearch, setRawSearch] = useState(initial.q);
  const [search, setSearch] = useState(initial.q);
  const [semanticSearch, setSemanticSearch] = useState(initial.semantic);
  const [activeTags, setActiveTags] = useState<string[]>(initial.tags);
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("nav-sort-mode");
      if (saved === "newest" || saved === "popular") return saved;
    }
    return "default";
  });
  const [minRatingFilter, setMinRatingFilter] = useState<number | null>(initial.minRating);
  const [popularityFilter, setPopularityFilter] = useState<PopularityFilter | null>(initial.popularity);

  // 持久化排序模式
  useEffect(() => { localStorage.setItem("nav-sort-mode", sortMode); }, [sortMode]);

  // State → URL 同步（debounce 后的 search + 其他筛选）
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams();
    const trimmedSearch = search.trim();
    if (trimmedSearch) sp.set("q", trimmedSearch);
    if (activeCategory !== "all") sp.set("cat", activeCategory);
    if (activeTags.length > 0) sp.set("tag", activeTags.join(","));
    if (minRatingFilter !== null) sp.set("minRating", String(minRatingFilter));
    if (popularityFilter) sp.set("popularity", popularityFilter);
    if (!semanticSearch) sp.set("semantic", "false");
    const qs = sp.toString();
    const newUrl = qs ? `/?${qs}` : "/";
    const currentUrl = window.location.pathname + window.location.search;
    if (currentUrl !== newUrl) {
      window.history.replaceState(null, "", newUrl);
    }
  }, [search, activeCategory, activeTags, minRatingFilter, popularityFilter, semanticSearch]);

  // 浏览器前进/后退 → State 同步
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handlePopState = () => {
      const parsed = parseFiltersFromUrl(new URLSearchParams(window.location.search));
      setActiveCategory(parsed.cat);
      setRawSearch(parsed.q);
      setSearch(parsed.q);
      setActiveTags(parsed.tags);
      setMinRatingFilter(parsed.minRating);
      setPopularityFilter(parsed.popularity);
      setSemanticSearch(parsed.semantic);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const toggleTag = useCallback((slug: string) => {
    setActiveTags((prev) =>
      prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : [...prev, slug]
    );
  }, []);
  const clearTags = useCallback(() => setActiveTags([]), []);
  const clearSearchExperienceFilters = useCallback(() => {
    setActiveTags([]);
    setMinRatingFilter(null);
    setPopularityFilter(null);
  }, []);

  return {
    activeCategory, rawSearch, search, semanticSearch, activeTags, sortMode,
    minRatingFilter, popularityFilter,
    setActiveCategory, setRawSearch, setSearch, setSemanticSearch, setSortMode,
    setMinRatingFilter, setPopularityFilter,
    toggleTag, clearTags, clearSearchExperienceFilters,
  };
}

// ════════════════════════════════════════════════════════════
//  Hook 2: useServerSearch — debounce + 服务端搜索结果
// ════════════════════════════════════════════════════════════

interface ServerSearchParams {
  rawSearch: string;
  semanticSearch: boolean;
  activeCategory: string;
  activeTags: string[];
  minRatingFilter: number | null;
  popularityFilter: PopularityFilter | null;
  links: NavLink[];
  setSearch: (v: string) => void;
}

interface ServerSearchState {
  serverResults: NavLink[];
  searchLoading: boolean;
  searchFacets: SearchFacets;
  searchSuggestions: SearchSuggestion[];
  zeroResultRecommendations: NavLink[];
  setServerResults: (v: NavLink[]) => void;
}

function useServerSearch(params: ServerSearchParams): ServerSearchState {
  const {
    rawSearch, semanticSearch, activeCategory, activeTags,
    minRatingFilter, popularityFilter, links, setSearch,
  } = params;

  const [serverResults, setServerResults] = useState<NavLink[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFacets, setSearchFacets] = useState<SearchFacets>(EMPTY_SEARCH_FACETS);
  const [searchSuggestions, setSearchSuggestions] = useState<SearchSuggestion[]>([]);
  const [zeroResultRecommendations, setZeroResultRecommendations] = useState<NavLink[]>([]);

  // Debounce: 200ms → server search
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const q = rawSearch.trim();
    if (!q) {
      const localFacets = buildSearchFacets(links, {
        category: activeCategory,
        tagSlugs: activeTags,
        minRating: minRatingFilter,
        popularity: popularityFilter,
      });
      setSearch("");
      setServerResults([]);
      setSearchLoading(false);
      setSearchFacets(localFacets);
      setSearchSuggestions(buildSearchSuggestions("", links, localFacets));
      setZeroResultRecommendations([]);
      return;
    }

    setSearchLoading(true);
    // AbortController: 取消上一次未完成的 fetch，避免竞态
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearch(q);
      try {
        const sp = new URLSearchParams({ q });
        if (semanticSearch) sp.set("semantic", "true");
        if (activeCategory !== "all") sp.set("category", activeCategory);
        if (activeTags.length > 0) sp.set("tag", activeTags.join(","));
        if (minRatingFilter !== null) sp.set("minRating", String(minRatingFilter));
        if (popularityFilter) sp.set("popularity", popularityFilter);
        const res = await fetch(`/api/search?${sp}`, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          // Map server results back to NavLink format
          const mapped: NavLink[] = (data.results || []).map((r: Record<string, unknown>) => ({
            id: r.id as string,
            title: r.title as string,
            url: r.url as string,
            description: r.description as string | null,
            icon: r.icon as string | null,
            category_id: null,
            approved: true,
            paid: r.paid as boolean,
            featured: r.featured as boolean,
            click_count: r.click_count as number,
            created_at: "",
            score: r.score as number | undefined,
            similarity: r.similarity as number | undefined,
            avg_rating: r.avg_rating as number | undefined,
            review_count: r.review_count as number | undefined,
            category_name: r.category_name as string | undefined,
            category_slug: r.category_slug as string | undefined,
            tags: r.tags as NavLink["tags"],
            searchMeta: r.searchMeta as NavLink["searchMeta"],
          }));
          setServerResults(mapped);
          setSearchFacets((data.facets ?? EMPTY_SEARCH_FACETS) as SearchFacets);
          setSearchSuggestions((data.suggestions ?? []) as SearchSuggestion[]);
          setZeroResultRecommendations((data.recommendations ?? []) as NavLink[]);
        }
      } catch (err) {
        // AbortError 是正常的取消行为，不需要处理
        if (err instanceof DOMException && err.name === "AbortError") return;
        // 网络错误时回退到客户端搜索
        setServerResults([]);
        setSearchFacets(EMPTY_SEARCH_FACETS);
        setSearchSuggestions([]);
        setZeroResultRecommendations([]);
      }
      setSearchLoading(false);
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [rawSearch, activeCategory, semanticSearch, activeTags, minRatingFilter, popularityFilter, links, setSearch]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return {
    serverResults, searchLoading, searchFacets, searchSuggestions,
    zeroResultRecommendations, setServerResults,
  };
}

// ════════════════════════════════════════════════════════════
//  Hook 3: useDerivedLinks — 纯派生数据（无副作用）
// ════════════════════════════════════════════════════════════

interface DerivedLinksParams {
  categories: Category[];
  links: NavLink[];
  activeCategory: string;
  activeTags: string[];
  sortMode: SortMode;
  search: string;
  serverResults: NavLink[];
  precomputed?: PrecomputedNavData;
}

interface DerivedLinksState {
  q: string;
  filtered: NavLink[];
  featured: NavLink[];
  latest: NavLink[];
  popular: NavLink[];
  linkSections: { key: string; links: NavLink[]; label: string; accent: string }[];
  showLinks: boolean;
  flatResults: { type: "link"; link: NavLink }[];
  totalResults: number;
  hasResults: boolean;
  tabKeys: { key: string; label: string }[];
  tabCounts: { key: string; label: string; count: number }[];
  tabTree: SidebarTabNode[];
  currentLabel: string;
  availableTags: Tag[];
  descendantSlugsMap: Map<string, Set<string>>;
}

function useDerivedLinks(params: DerivedLinksParams): DerivedLinksState {
  const {
    categories, links, activeCategory, activeTags,
    sortMode, search, serverResults, precomputed,
  } = params;

  const q = search.trim().toLowerCase();

  // ── 服务端预计算数据（precomputed 存在时跳过 5 个 useMemo）──

  // 后代 slug 映射
  const clientDescMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const cat of categories) {
      map.set(cat.slug, new Set(getDescendantSlugs(categories, cat.slug)));
    }
    return map;
  }, [categories]);

  const descendantSlugsMap: Map<string, Set<string>> = useMemo(() => {
    if (!precomputed) return clientDescMap;
    // 从 Record<string, string[]> 转回 Map<string, Set<string>>
    const map = new Map<string, Set<string>>();
    for (const [slug, arr] of Object.entries(precomputed.descendantSlugsMap)) {
      map.set(slug, new Set(arr));
    }
    return map;
  }, [precomputed, clientDescMap]);

  // Tab keys
  const tabKeys = useMemo(
    () => precomputed?.tabKeys ?? [
      { key: "all", label: "全部" },
      ...categories
        .filter((c) => !c.parent_id && c.slug !== "model-ranking")
        .map((c) => ({ key: c.slug, label: SECTION_LABELS[c.slug] || c.name })),
    ],
    [precomputed, categories],
  );

  // Tab counts
  const tabCounts = useMemo(
    () => precomputed?.tabCounts ?? clientTabCounts(tabKeys, links, Object.fromEntries(
      Array.from(clientDescMap.entries()).map(([k, v]) => [k, Array.from(v)])
    )),
    [precomputed, tabKeys, links, clientDescMap],
  );

  // 侧边栏树形结构
  const tabTree = useMemo<SidebarTabNode[]>(
    () => precomputed?.tabTree ?? clientTabTree(categories, links, Object.fromEntries(
      Array.from(clientDescMap.entries()).map(([k, v]) => [k, Array.from(v)])
    )),
    [precomputed, categories, links, clientDescMap],
  );

  // 去重标签列表
  const availableTags = useMemo(
    () => precomputed?.availableTags ?? clientAvailableTags(links),
    [precomputed, links],
  );

  // Filtered + sorted
  const filtered = useMemo(() => {
    let pool: NavLink[];
    if (q) {
      pool = serverResults;
      if (sortMode === "newest") {
        // Server results don't have created_at, fall back to score order
      } else if (sortMode === "popular") {
        pool = [...pool].sort((a, b) => b.click_count - a.click_count);
      }
    } else {
      if (activeCategory === "all") {
        pool = links;
      } else {
        const slugs = descendantSlugsMap.get(activeCategory);
        pool = slugs
          ? links.filter((l) => slugs.has(l.category_slug ?? ""))
          : links.filter((l) => l.category_slug === activeCategory);
      }

      if (sortMode === "newest") {
        pool = [...pool].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      } else if (sortMode === "popular") {
        pool = [...pool].sort((a, b) => b.click_count - a.click_count);
      }
    }

    // 多标签筛选（AND 语义）
    if (activeTags.length > 0) {
      pool = pool.filter((link) => {
        const linkTagSlugs = (link.tags ?? []).map((t) => t.slug);
        return activeTags.every((slug) => linkTagSlugs.includes(slug));
      });
    }

    return pool;
  }, [links, serverResults, activeCategory, q, sortMode, activeTags, descendantSlugsMap]);

  const featured = useMemo(
    () =>
      activeCategory === "all" && !q
        ? filtered.filter((l) => l.featured || l.paid)
        : [],
    [filtered, activeCategory, q],
  );

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

  const popular = useMemo(() => {
    if (activeCategory !== "all" || q) return [];
    if (sortMode === "popular") return [];
    return [...links]
      .filter((l) => !l.featured && !l.paid && l.click_count > 0)
      .sort((a, b) => b.click_count - a.click_count)
      .slice(0, 6);
  }, [links, activeCategory, q, sortMode]);

  const linkSections = useMemo(() => {
    if (q) {
      return [{
        key: "search-results",
        links: filtered,
        label: `搜索结果 (${filtered.length})`,
        accent: "",
      }];
    }

    if (activeCategory !== "all" && activeCategory !== "model-ranking") {
      const cat = categories.find((c) => c.slug === activeCategory);
      if (!cat) return [];
      return [
        {
          key: cat.slug,
          links: filtered,
          label: SECTION_LABELS[cat.slug] || cat.name,
          accent: "",
        },
      ];
    }
    if (activeCategory !== "all") return [];
    const filterNonFeatured = (items: NavLink[]) =>
      q ? items : items.filter((l) => !l.featured && !l.paid);
    return categories
      .filter((c) => !c.parent_id && c.slug !== "model-ranking")
      .map((c) => {
        const slugs = descendantSlugsMap.get(c.slug);
        const sectionLinks = slugs
          ? filtered.filter((l) => slugs.has(l.category_slug ?? ""))
          : filtered.filter((l) => l.category_slug === c.slug);
        return {
          key: c.slug,
          links: filterNonFeatured(sectionLinks),
          label: SECTION_LABELS[c.slug] || c.name,
          accent: "",
        };
      })
      .filter((s) => s.links.length > 0);
  }, [categories, filtered, activeCategory, q, descendantSlugsMap]);

  const currentLabel = useMemo(
    () => tabKeys.find((t) => t.key === activeCategory)?.label ?? "全部",
    [tabKeys, activeCategory],
  );

  const showLinks = true;

  const flatResults = useMemo(() => {
    const items: { type: "link"; link: NavLink }[] = [];
    if (showLinks) {
      if (featured.length > 0) featured.forEach((l) => items.push({ type: "link", link: l }));
      if (latest.length > 0) latest.forEach((l) => items.push({ type: "link", link: l }));
      if (popular.length > 0) popular.forEach((l) => items.push({ type: "link", link: l }));
      for (const section of linkSections) {
        if (section.links.length > 0 && (activeCategory === "all" || activeCategory === section.key || q)) {
          section.links.forEach((l) => items.push({ type: "link", link: l }));
        }
      }
    }
    return items;
  }, [showLinks, featured, latest, popular, linkSections, activeCategory, q]);

  const totalResults = flatResults.length;
  const hasResults = totalResults > 0;

  return {
    q, filtered, featured, latest, popular, linkSections,
    showLinks, flatResults,
    totalResults, hasResults,
    tabKeys, tabCounts, tabTree, currentLabel, availableTags, descendantSlugsMap,
  };
}

// ════════════════════════════════════════════════════════════
//  Hook 4: useKeyboardNav — 键盘导航 + 快捷键
// ════════════════════════════════════════════════════════════

interface KeyboardNavParams {
  flatResults: { type: "link"; link: NavLink }[];
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

interface KeyboardNavState {
  focusedIndex: number;
  setFocusedIndex: (v: number) => void;
  handleSearchKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  handleResultKeyDown: (e: KeyboardEvent<HTMLElement>, index: number) => void;
  resetFocus: () => void;
}

function useKeyboardNav(params: KeyboardNavParams): KeyboardNavState {
  const {
    flatResults, rawSearch, search, activeCategory, activeTags,
    totalResults, q, tabKeys,
    inputRef, resultsRef, announceRef,
    setRawSearch, setSearch, setServerResults, setActiveCategory,
  } = params;

  const [focusedIndex, setFocusedIndex] = useState(-1);

  const resetFocus = useCallback(() => setFocusedIndex(-1), []);

  // ⌘1-9: switch categories
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

  // Reset focus when search or category changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetFocus();
  }, [search, activeCategory, activeTags, resetFocus]);

  // Announce results count for screen readers
  useEffect(() => {
    if (announceRef.current && q) announceRef.current.textContent = `找到 ${totalResults} 个结果`;
  }, [totalResults, q, announceRef]);

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
          if (rawSearch) { setRawSearch(""); setSearch(""); setServerResults([]); }
          else inputRef.current?.blur();
          resetFocus();
          break;
      }
    },
    [flatResults.length, rawSearch, resetFocus, setRawSearch, setSearch, setServerResults, inputRef, resultsRef],
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
            trackClick(link.url);
          }
          break;
      }
    },
    [flatResults, inputRef, resultsRef],
  );

  return {
    focusedIndex, setFocusedIndex,
    handleSearchKeyDown, handleResultKeyDown, resetFocus,
  };
}

// ════════════════════════════════════════════════════════════
//  组合层: useLinksFilter — 公开 API（与重构前完全一致）
// ════════════════════════════════════════════════════════════

export function useLinksFilter({
  categories,
  links,
  precomputed,
}: {
  categories: Category[];
  links: NavLink[];
  precomputed?: PrecomputedNavData;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const announceRef = useRef<HTMLDivElement>(null);

  const filters = useFilterState();
  const serverSearch = useServerSearch({
    rawSearch: filters.rawSearch,
    semanticSearch: filters.semanticSearch,
    activeCategory: filters.activeCategory,
    activeTags: filters.activeTags,
    minRatingFilter: filters.minRatingFilter,
    popularityFilter: filters.popularityFilter,
    links,
    setSearch: filters.setSearch,
  });
  const derived = useDerivedLinks({
    categories, links,
    activeCategory: filters.activeCategory,
    activeTags: filters.activeTags,
    sortMode: filters.sortMode,
    search: filters.search,
    serverResults: serverSearch.serverResults,
    precomputed,
  });
  const keyboard = useKeyboardNav({
    flatResults: derived.flatResults,
    rawSearch: filters.rawSearch,
    search: filters.search,
    activeCategory: filters.activeCategory,
    activeTags: filters.activeTags,
    totalResults: derived.totalResults,
    q: derived.q,
    tabKeys: derived.tabKeys,
    inputRef, resultsRef, announceRef,
    setRawSearch: filters.setRawSearch,
    setSearch: filters.setSearch,
    setServerResults: serverSearch.setServerResults,
    setActiveCategory: filters.setActiveCategory,
  });

  return {
    // State
    activeCategory: filters.activeCategory,
    setActiveCategory: filters.setActiveCategory,
    rawSearch: filters.rawSearch,
    setRawSearch: filters.setRawSearch,
    search: filters.search,
    setSearch: filters.setSearch,
    focusedIndex: keyboard.focusedIndex,
    setFocusedIndex: keyboard.setFocusedIndex,
    sortMode: filters.sortMode,
    setSortMode: filters.setSortMode,
    q: derived.q,
    searchLoading: serverSearch.searchLoading,
    semanticSearch: filters.semanticSearch,
    setSemanticSearch: filters.setSemanticSearch,

    // Tag filter
    activeTags: filters.activeTags,
    toggleTag: filters.toggleTag,
    clearTags: filters.clearTags,
    clearSearchExperienceFilters: filters.clearSearchExperienceFilters,
    availableTags: derived.availableTags,
    minRatingFilter: filters.minRatingFilter,
    setMinRatingFilter: filters.setMinRatingFilter,
    popularityFilter: filters.popularityFilter,
    setPopularityFilter: filters.setPopularityFilter,
    searchFacets: serverSearch.searchFacets,
    searchSuggestions: serverSearch.searchSuggestions,
    zeroResultRecommendations: serverSearch.zeroResultRecommendations,

    // Refs
    inputRef,
    resultsRef,
    announceRef,

    // Tab data
    tabKeys: derived.tabKeys,
    tabCounts: derived.tabCounts,
    tabTree: derived.tabTree,
    currentLabel: derived.currentLabel,

    // Derived data
    filtered: derived.filtered,
    featured: derived.featured,
    latest: derived.latest,
    popular: derived.popular,
    linkSections: derived.linkSections,
    showLinks: derived.showLinks,
    flatResults: derived.flatResults,
    totalResults: derived.totalResults,
    hasResults: derived.hasResults,

    // Handlers
    handleSearchKeyDown: keyboard.handleSearchKeyDown,
    handleResultKeyDown: keyboard.handleResultKeyDown,
    resetFocus: keyboard.resetFocus,
  };
}
