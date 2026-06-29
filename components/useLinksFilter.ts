"use client";

import { useState, useMemo, useRef, useCallback, useEffect, type KeyboardEvent } from "react";
import type { NavLink, Category, Tag, ModelRanking } from "@/lib/types";
import { SECTION_LABELS } from "@/lib/nav-config";
import { isSafeUrl } from "@/lib/utils";
import { getDescendantSlugs } from "@/lib/category-tree";
import type {
  PopularityFilter,
  SearchFacets,
  SearchSuggestion,
} from "@/lib/search-experience";
import { buildSearchFacets, buildSearchSuggestions } from "@/lib/search-experience";

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
  const cat = sp.get("cat")?.trim() || "all";
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

/** 侧边栏树节点（含计数和子节点） */
export interface SidebarTabNode {
  key: string;
  label: string;
  count: number;
  children: SidebarTabNode[];
}

type SortMode = "default" | "newest" | "popular";

const EMPTY_SEARCH_FACETS: SearchFacets = {
  categories: [],
  tags: [],
  ratings: [],
  popularity: [],
};

/** 简单文本匹配（替代 Fuse.js — 排行榜仅 29 条，精确匹配即可） */
function matchRankings(rankings: ModelRanking[], q: string) {
  if (!q) return rankings;
  const query = q.toLowerCase();
  return rankings.filter(
    (r) =>
      r.model_name.toLowerCase().includes(query) ||
      (r.description && r.description.toLowerCase().includes(query)) ||
      (r.source && r.source.toLowerCase().includes(query)),
  );
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
  const [initial] = useState(readInitialFilters);
  const [activeCategory, setActiveCategory] = useState(initial.cat);
  const [rawSearch, setRawSearch] = useState(initial.q);
  const [search, setSearch] = useState(initial.q);
  const [semanticSearch, setSemanticSearch] = useState(initial.semantic);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  // 多标签筛选（AND 语义：必须同时拥有所有选中的标签 slug）
  const [activeTags, setActiveTags] = useState<string[]>(initial.tags);
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

  // ── Server search results ──
  const [serverResults, setServerResults] = useState<NavLink[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFacets, setSearchFacets] = useState<SearchFacets>(EMPTY_SEARCH_FACETS);
  const [searchSuggestions, setSearchSuggestions] = useState<SearchSuggestion[]>([]);
  const [zeroResultRecommendations, setZeroResultRecommendations] = useState<NavLink[]>([]);
  const [minRatingFilter, setMinRatingFilter] = useState<number | null>(initial.minRating);
  const [popularityFilter, setPopularityFilter] = useState<PopularityFilter | null>(initial.popularity);

  // ── 后代 slug 映射（slug → 包含自身及所有后代的 slug 集合）──
  // 用于选中父分类时聚合显示子分类的链接
  const descendantSlugsMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const cat of categories) {
      map.set(cat.slug, new Set(getDescendantSlugs(categories, cat.slug)));
    }
    return map;
  }, [categories]);

  // ── Tab keys（仅顶级分类）──
  const tabKeys = useMemo(
    () => [
      { key: "all", label: "全部" },
      ...categories
        .filter((c) => !c.parent_id)
        .map((c) => ({ key: c.slug, label: SECTION_LABELS[c.slug] || c.name })),
    ],
    [categories],
  );

  // ── 计算某分类的链接数（含子分类）──
  const countLinksForSlug = useCallback(
    (slug: string): number => {
      const slugs = descendantSlugsMap.get(slug);
      if (!slugs) return 0;
      return links.filter((l) => slugs.has(l.category_slug ?? "")).length;
    },
    [links, descendantSlugsMap]
  );

  const tabCounts = useMemo(
    () => tabKeys.map((tab) => ({
      ...tab,
      count: tab.key === "all" ? links.length : countLinksForSlug(tab.key),
    })),
    [tabKeys, links, countLinksForSlug]
  );

  // ── 侧边栏树形结构（"全部" + 顶级分类 + 子分类，含计数）──
  const tabTree = useMemo<SidebarTabNode[]>(() => {
    const buildNode = (cat: Category): SidebarTabNode => {
      const children = categories.filter((c) => c.parent_id === cat.id);
      return {
        key: cat.slug,
        label: SECTION_LABELS[cat.slug] || cat.name,
        count: countLinksForSlug(cat.slug),
        children: children.map(buildNode),
      };
    };
    return [
      { key: "all", label: "全部", count: links.length, children: [] },
      ...categories
        .filter((c) => !c.parent_id)
        .map(buildNode),
    ];
  }, [categories, countLinksForSlug, links.length]);

  // ── Persist sort ──
  useEffect(() => { localStorage.setItem("nav-sort-mode", sortMode); }, [sortMode]);

  // ── State → URL 同步（debounce 后的 search + 其他筛选）──
  // 用 replaceState 而非 router.replace，避免触发服务端重渲染
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

  // ── 浏览器前进/后退 → State 同步 ──
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

  // ── Debounce: 200ms → server search ──
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
        const params = new URLSearchParams({ q });
        if (semanticSearch) params.set("semantic", "true");
        if (activeCategory !== "all") params.set("category", activeCategory);
        if (activeTags.length > 0) params.set("tag", activeTags.join(","));
        if (minRatingFilter !== null) params.set("minRating", String(minRatingFilter));
        if (popularityFilter) params.set("popularity", popularityFilter);
        const res = await fetch(`/api/search?${params}`, { signal: controller.signal });
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
  }, [rawSearch, activeCategory, semanticSearch, activeTags, minRatingFilter, popularityFilter, links]);
  /* eslint-enable react-hooks/set-state-in-effect */

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

  // ── Tag filter handlers ──
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

  // 从 links 中提取去重后的标签列表（按名称排序）
  const availableTags = useMemo(() => {
    const tagMap = new Map<string, Tag>();
    for (const link of links) {
      for (const tag of link.tags ?? []) {
        if (!tagMap.has(tag.id)) tagMap.set(tag.id, tag);
      }
    }
    return Array.from(tagMap.values()).sort((a, b) => a.name.localeCompare(b.name, "zh-Hans"));
  }, [links]);

  // ── Filtered + sorted ──
  // When searching: use server results. Otherwise: use local data.
  // 标签筛选（AND 语义）会同时作用于搜索结果和分类结果
  const filtered = useMemo(() => {
    let pool: NavLink[];
    if (q) {
      // Use server search results
      pool = serverResults;
      if (sortMode === "newest") {
        // Server results don't have created_at, fall back to score order
      } else if (sortMode === "popular") {
        pool = [...pool].sort((a, b) => b.click_count - a.click_count);
      }
    } else {
      // No search: filter locally
      // 分类层级：选中父分类时聚合显示所有子分类的链接
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

    // 多标签筛选（AND 语义：必须同时拥有所有选中标签）
    if (activeTags.length > 0) {
      pool = pool.filter((link) => {
        const linkTagSlugs = (link.tags ?? []).map((t) => t.slug);
        return activeTags.every((slug) => linkTagSlugs.includes(slug));
      });
    }

    return pool;
  }, [links, serverResults, activeCategory, q, sortMode, activeTags, descendantSlugsMap]);

  // ── Featured (fixed sort comparator) ──
  const featured = useMemo(
    () =>
      activeCategory === "all" && !q
        ? filtered.filter((l) => l.featured || l.paid)
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

  // ── Popular (hot rankings by click_count) ──
  const popular = useMemo(() => {
    if (activeCategory !== "all" || q) return [];
    if (sortMode === "popular") return [];
    return [...links]
      .filter((l) => !l.featured && !l.paid && l.click_count > 0)
      .sort((a, b) => b.click_count - a.click_count)
      .slice(0, 6);
  }, [links, activeCategory, q, sortMode]);

  // ── Dynamic link sections ──
  const linkSections = useMemo(() => {
    // Searching: show all results in a single section
    if (q) {
      return [{
        key: "search-results",
        links: filtered,
        label: `搜索结果 (${filtered.length})`,
        accent: "",
      }];
    }

    // Specific category selected: show all links for that category
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
    // "all" tab: show sections per top-level category (excluding model-ranking)
    // 分类层级：仅展示顶级分类，子分类的链接聚合到父分类 section 中
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

  // ── Current label ──
  const currentLabel = useMemo(
    () => tabKeys.find((t) => t.key === activeCategory)?.label ?? "全部",
    [tabKeys, activeCategory],
  );

  // ── Filtered rankings (client-side simple text match — small dataset) ──
  const filteredRankings = useMemo(
    () => matchRankings(modelRankings, q),
    [modelRankings, q],
  );

  const showRankings =
    (activeCategory === "all" || activeCategory === "model-ranking") && filteredRankings.length > 0;
  const showLinks = activeCategory !== "model-ranking";

  // ── Flat results for keyboard nav ──
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
          if (rawSearch) { setRawSearch(""); setSearch(""); setServerResults([]); }
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetFocus();
  }, [search, activeCategory, activeTags, resetFocus]);

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
    searchLoading,
    semanticSearch,
    setSemanticSearch,

    // Tag filter
    activeTags,
    toggleTag,
    clearTags,
    clearSearchExperienceFilters,
    availableTags,
    minRatingFilter,
    setMinRatingFilter,
    popularityFilter,
    setPopularityFilter,
    searchFacets,
    searchSuggestions,
    zeroResultRecommendations,

    // Refs
    inputRef,
    resultsRef,
    announceRef,

    // Tab data
    tabKeys,
    tabCounts,
    tabTree,
    currentLabel,

    // Derived data
    filtered,
    featured,
    latest,
    popular,
    linkSections,
    showRankings,
    showLinks,
    filteredRankings,
    flatResults,
    totalResults,
    hasResults,

    // Handlers
    handleSearchKeyDown,
    handleResultKeyDown,
    resetFocus,
  };
}
