/**
 * 服务端预计算派生数据
 *
 * 从 useLinksFilter.useDerivedLinks 中提取的纯函数，
 * 依赖仅来自服务端获取的 categories/links，不涉及任何客户端状态。
 * 在 RSC (page.tsx) 中计算后通过 props 传入客户端，跳过 5 个 useMemo。
 *
 * 设计约束：
 *   descendantSlugsMap 使用 Record<string, string[]> 而非 Map<string, Set<string>>，
 *   因为 Map/Set 无法跨 RSC→client 序列化边界。
 *   客户端用 .includes() 替代 .has()——分类数 <20，性能无差异。
 */

import type { Category, Tag, NavLink, ModelRanking } from "@/lib/types";
import { SECTION_LABELS } from "@/lib/nav-config";
import { getDescendantSlugs } from "@/lib/category-tree";

// ── 共享类型 ────────────────────────────────────────────────

/** 侧边栏树节点（含计数和子节点） */
export interface SidebarTabNode {
  key: string;
  label: string;
  count: number;
  children: SidebarTabNode[];
}

/** page.tsx → Navigation 的预计算数据（可序列化） */
export interface PrecomputedNavData {
  descendantSlugsMap: Record<string, string[]>;
  tabKeys: { key: string; label: string }[];
  tabCounts: { key: string; label: string; count: number }[];
  tabTree: SidebarTabNode[];
  availableTags: Tag[];
}

// ── 纯函数 ──────────────────────────────────────────────────

/**
 * 后代 slug 映射（slug → 包含自身及所有后代的 slug 数组）
 *
 * 对应 useDerivedLinks 中 descendantSlugsMap useMemo (L378-384)。
 * 返回 Record（可序列化）而非 Map<string, Set<string>>。
 */
export function buildDescendantSlugsMap(
  categories: Category[],
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const cat of categories) {
    map[cat.slug] = getDescendantSlugs(categories, cat.slug);
  }
  return map;
}

/**
 * Tab keys（仅顶级分类 + "全部"）
 *
 * 对应 useDerivedLinks 中 tabKeys useMemo (L387-395)。
 */
export function buildTabKeys(categories: Category[]) {
  return [
    { key: "all", label: "全部" },
    ...categories
      .filter((c) => !c.parent_id)
      .map((c) => ({ key: c.slug, label: SECTION_LABELS[c.slug] || c.name })),
  ];
}

/**
 * 统计某分类（含后代）下的链接数
 */
function countLinksForSlug(
  slug: string,
  links: NavLink[],
  descendantSlugsMap: Record<string, string[]>,
): number {
  const slugs = descendantSlugsMap[slug];
  if (!slugs) return 0;
  return links.filter((l) => slugs.includes(l.category_slug ?? "")).length;
}

/**
 * Tab keys 带 link 计数
 *
 * 对应 useDerivedLinks 中 tabCounts useMemo (L406-412)。
 * 内联了原 countLinksForSlug useCallback。
 */
export function buildTabCounts(
  tabKeys: { key: string; label: string }[],
  links: NavLink[],
  descendantSlugsMap: Record<string, string[]>,
) {
  return tabKeys.map((tab) => ({
    ...tab,
    count: tab.key === "all" ? links.length : countLinksForSlug(tab.key, links, descendantSlugsMap),
  }));
}

/**
 * 侧边栏树形结构
 *
 * 对应 useDerivedLinks 中 tabTree useMemo (L415-431)。
 */
export function buildTabTree(
  categories: Category[],
  links: NavLink[],
  descendantSlugsMap: Record<string, string[]>,
): SidebarTabNode[] {
  const buildNode = (cat: Category): SidebarTabNode => {
    const children = categories.filter((c) => c.parent_id === cat.id);
    return {
      key: cat.slug,
      label: SECTION_LABELS[cat.slug] || cat.name,
      count: countLinksForSlug(cat.slug, links, descendantSlugsMap),
      children: children.map(buildNode),
    };
  };

  return [
    { key: "all", label: "全部", count: links.length, children: [] },
    ...categories
      .filter((c) => !c.parent_id)
      .map(buildNode),
  ];
}

/**
 * 从 links 中提取去重后的标签列表
 *
 * 对应 useDerivedLinks 中 availableTags useMemo (L434-442)。
 */
export function buildAvailableTags(links: NavLink[]): Tag[] {
  const tagMap = new Map<string, Tag>();
  for (const link of links) {
    for (const tag of link.tags ?? []) {
      if (!tagMap.has(tag.id)) tagMap.set(tag.id, tag);
    }
  }
  return Array.from(tagMap.values()).sort((a, b) => a.name.localeCompare(b.name, "zh-Hans"));
}

/**
 * 简单文本匹配（替代 Fuse.js — 排行榜仅 ~29 条，精确匹配即可）
 *
 * 对应原 useLinksFilter.ts 顶层的 matchRankings 函数 (L95-104)。
 */
export function matchRankings(rankings: ModelRanking[], q: string) {
  if (!q) return rankings;
  const query = q.toLowerCase();
  return rankings.filter(
    (r) =>
      r.model_name.toLowerCase().includes(query) ||
      (r.description && r.description.toLowerCase().includes(query)) ||
      (r.source && r.source.toLowerCase().includes(query)),
  );
}
