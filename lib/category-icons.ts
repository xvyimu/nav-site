/**
 * 分类 slug → Lucide 图标组件映射
 *
 * 统一管理所有分类的图标，确保风格一致。
 * 新增分类时在此添加对应图标即可。
 */

import {
  LayoutGrid,
  Zap,
  Bot,
  Cloud,
  Code2,
  Palette,
  Wrench,
  BookOpen,
  Monitor,
  GraduationCap,
  Building2,
  Globe,
  type LucideIcon,
} from "lucide-react";

/** 分类 slug → Lucide 图标 */
export const categoryIcons: Record<string, LucideIcon> = {
  all: LayoutGrid,
  "free-relay": Zap,
  "ai-api": Bot,
  "cloud-vps": Cloud,
  "dev-tools": Code2,
  design: Palette,
  "online-tools": Wrench,
  "open-source": BookOpen,
  software: Monitor,
  learning: GraduationCap,
  business: Building2,
};

/** 默认图标（未匹配到 slug 时使用） */
export const defaultCategoryIcon: LucideIcon = Globe;

/** 根据 slug 获取对应的 Lucide 图标组件 */
export function getCategoryIcon(slug: string): LucideIcon {
  return categoryIcons[slug] ?? defaultCategoryIcon;
}
