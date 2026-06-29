/**
 * 分类层级工具函数
 *
 * 从扁平的分类列表计算某分类的所有后代 slug
 * （用于选中父分类时聚合显示子分类的链接）。
 */

import type { Category } from "@/lib/types";

/**
 * 获取某分类的所有后代 slug（包括自身）
 *
 * 用于选中父分类时聚合显示：filter links where category_slug IN descendantSlugs
 *
 * @param categories 扁平分类列表
 * @param slug 目标分类 slug
 * @returns 包含自身及所有后代 slug 的数组
 */
export function getDescendantSlugs(categories: Category[], slug: string): string[] {
  // 找到目标分类
  const target = categories.find((c) => c.slug === slug);
  if (!target) return [slug];

  const result: string[] = [slug];

  // 找到直接子分类
  const children = categories.filter((c) => c.parent_id === target.id);

  // 递归收集所有后代
  for (const child of children) {
    const childSlugs = getDescendantSlugs(categories, child.slug);
    result.push(...childSlugs);
  }

  return result;
}
