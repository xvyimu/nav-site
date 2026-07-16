"use client";

import { useMemo } from "react";
import type { Category, NavLink, Tag } from "@/lib/types";
import { SECTION_LABELS } from "@/lib/nav-config";
import { getDescendantSlugs } from "@/lib/category-tree";
import {
  buildTabCounts as clientTabCounts,
  buildTabTree as clientTabTree,
  buildAvailableTags as clientAvailableTags,
  type SidebarTabNode,
  type PrecomputedNavData,
} from "@/lib/nav-derived-data";
import {
  applySearchFilters,
  type PopularityFilter,
} from "@/lib/search-experience";
import type { LinkResultItem, LinkSection, SortMode } from "./types";

export interface DerivedLinksParams {
  categories: Category[];
  links: NavLink[];
  activeCategory: string;
  activeTags: string[];
  sortMode: SortMode;
  search: string;
  serverResults: NavLink[];
  precomputed?: PrecomputedNavData;
  minRatingFilter?: number | null;
  popularityFilter?: PopularityFilter | null;
}

export interface DerivedLinksState {
  q: string;
  filtered: NavLink[];
  featured: NavLink[];
  latest: NavLink[];
  popular: NavLink[];
  linkSections: LinkSection[];
  showLinks: boolean;
  flatResults: LinkResultItem[];
  totalResults: number;
  hasResults: boolean;
  tabKeys: { key: string; label: string }[];
  tabCounts: { key: string; label: string; count: number }[];
  tabTree: SidebarTabNode[];
  currentLabel: string;
  availableTags: Tag[];
  descendantSlugsMap: Map<string, Set<string>>;
}

export function useDerivedLinks(params: DerivedLinksParams): DerivedLinksState {
  const {
    categories,
    links,
    activeCategory,
    activeTags,
    sortMode,
    search,
    serverResults,
    precomputed,
    minRatingFilter = null,
    popularityFilter = null,
  } = params;

  const q = search.trim().toLowerCase();

  const descendantSlugsMap: Map<string, Set<string>> = useMemo(() => {
    const map = new Map<string, Set<string>>();
    if (precomputed) {
      for (const [slug, arr] of Object.entries(precomputed.descendantSlugsMap)) {
        map.set(slug, new Set(arr));
      }
      return map;
    }
    for (const cat of categories) {
      map.set(cat.slug, new Set(getDescendantSlugs(categories, cat.slug)));
    }
    return map;
  }, [precomputed, categories]);

  const tabKeys = useMemo(
    () => precomputed?.tabKeys ?? [
      { key: "all", label: "全部" },
      ...categories
        .filter((c) => !c.parent_id && c.slug !== "model-ranking")
        .map((c) => ({ key: c.slug, label: SECTION_LABELS[c.slug] || c.name })),
    ],
    [precomputed, categories],
  );

  const tabCounts = useMemo(
    () => precomputed?.tabCounts ?? clientTabCounts(tabKeys, links, Object.fromEntries(
      Array.from(descendantSlugsMap.entries()).map(([k, v]) => [k, Array.from(v)])
    )),
    [precomputed, tabKeys, links, descendantSlugsMap],
  );

  const tabTree = useMemo<SidebarTabNode[]>(
    () => precomputed?.tabTree ?? clientTabTree(categories, links, Object.fromEntries(
      Array.from(descendantSlugsMap.entries()).map(([k, v]) => [k, Array.from(v)])
    )),
    [precomputed, categories, links, descendantSlugsMap],
  );

  const availableTags = useMemo(
    () => precomputed?.availableTags ?? clientAvailableTags(links),
    [precomputed, links],
  );

  const filtered = useMemo(() => {
    let pool: NavLink[];
    if (q) {
      pool = serverResults;
      if (sortMode === "popular") {
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

    // Shared filter semantics with server search (tags / rating / popularity).
    pool = applySearchFilters(pool, {
      tagSlugs: activeTags,
      minRating: minRatingFilter,
      popularity: popularityFilter,
    });

    return pool;
  }, [
    links,
    serverResults,
    activeCategory,
    q,
    sortMode,
    activeTags,
    descendantSlugsMap,
    minRatingFilter,
    popularityFilter,
  ]);

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
    // Exclude featured/paid so dual-track rows do not also appear in "最新".
    return [...links]
      .filter((l) => !l.featured && !l.paid)
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
    const items: LinkResultItem[] = [];
    const seen = new Set<string>();
    const pushUnique = (link: NavLink) => {
      if (seen.has(link.id)) return;
      seen.add(link.id);
      items.push({ type: "link", link });
    };

    if (showLinks) {
      if (featured.length > 0) featured.forEach(pushUnique);
      if (latest.length > 0) latest.forEach(pushUnique);
      if (popular.length > 0) popular.forEach(pushUnique);
      for (const section of linkSections) {
        if (section.links.length > 0 && (activeCategory === "all" || activeCategory === section.key || q)) {
          section.links.forEach(pushUnique);
        }
      }
    }
    return items;
  }, [showLinks, featured, latest, popular, linkSections, activeCategory, q]);

  const totalResults = flatResults.length;
  const hasResults = totalResults > 0;

  return {
    q,
    filtered,
    featured,
    latest,
    popular,
    linkSections,
    showLinks,
    flatResults,
    totalResults,
    hasResults,
    tabKeys,
    tabCounts,
    tabTree,
    currentLabel,
    availableTags,
    descendantSlugsMap,
  };
}
