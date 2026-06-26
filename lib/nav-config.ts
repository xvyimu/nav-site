/**
 * 导航站 UI 配置
 *
 * 集中管理分类标签、排行榜标签等显示映射。
 * 新增分类/排行榜源时在此添加即可，无需修改组件逻辑。
 *
 * @see DESIGN-DOC.md 分类体系章节
 */

/** 分类 slug → 导航 Tab 显示名称（纯文本，图标由 category-icons 提供） */
export const SECTION_LABELS: Record<string, string> = {
  // ========================================
  // AI & 大模型（原有，已就绪）
  // ========================================
  "ai-api": "AI & 大模型",

  // ========================================
  // 综合分类（已激活）
  // ========================================
  "cloud-vps": "云服务 & VPS",
  "dev-tools": "开发工具",
  "design": "设计资源",
  "online-tools": "在线工具",
  "open-source": "开源项目",
  "software": "软件应用",
  "learning": "学习 & 社区",
  "business": "企业 & 运营工具",
};

/** 排行榜前三名颜色 class（金/银/铜） */
export const RANK_COLORS = [
  "text-amber-500",
  "text-gray-400",
  "text-amber-700",
] as const;

/** 排行榜前三名背景 class */
export const RANK_BG_COLORS = [
  "bg-amber-50 dark:bg-amber-950/20",
  "bg-gray-50 dark:bg-gray-800/20",
  "bg-amber-50/50 dark:bg-amber-950/10",
] as const;
