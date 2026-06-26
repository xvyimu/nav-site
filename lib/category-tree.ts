/**
 * 分类层级工具函数
 *
 * 从扁平的分类列表构建树形结构，并计算某分类的所有后代 slug
 * （用于选中父分类时聚合显示子分类的链接）。
 */

import type { Category } from "@/lib/types";

/** 带子分类的树节点 */
export interface CategoryTreeNode extends Category {
  /** 直接子分类（已按 sort_order 排序） */
  children: CategoryTreeNode[];
}

/**
 * 从扁平分类列表构建树形结构
 *
 * 顶级分类（parent_id 为 null/undefined）作为根节点，
 * 子分类按 parent_id 归类到对应父节点下。
 *
 * @param categories 扁平分类列表（已按 sort_order 排序）
 * @returns 顶级分类树节点数组
 */
export function buildCategoryTree(categories: Category[]): CategoryTreeNode[] {
  const nodeMap = new Map<string, CategoryTreeNode>();
  const roots: CategoryTreeNode[] = [];

  // 第一遍：创建所有节点
  for (const cat of categories) {
    nodeMap.set(cat.id, { ...cat, children: [] });
  }

  // 第二遍：建立父子关系
  for (const cat of categories) {
    const node = nodeMap.get(cat.id);
    if (!node) continue;

    if (cat.parent_id) {
      const parent = nodeMap.get(cat.parent_id);
      if (parent) {
        parent.children.push(node);
      } else {
        // 父分类不存在（可能被删除），作为顶级处理
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}

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

/**
 * 判断某分类是否有子分类
 */
export function hasChildren(categories: Category[], categoryId: string): boolean {
  return categories.some((c) => c.parent_id === categoryId);
}
