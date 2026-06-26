export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  created_at: string;
  /** 父分类 ID（NULL = 顶级分类）。用于支持分类层级 */
  parent_id?: string | null;
}

/** 标签（多对多关联到 nav_links） */
export interface Tag {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface NavLink {
  id: string;
  title: string;
  url: string;
  description: string | null;
  icon: string | null;
  category_id: string | null;
  approved: boolean;
  paid: boolean;
  featured: boolean;
  click_count: number;
  created_at: string;
  updated_at?: string | null;
  slug?: string | null;
  // Joined field
  category_name?: string;
  category_slug?: string;
  // 关联标签（通过 nav_links_tags join 填充）
  tags?: Tag[];
}

export interface NavLinkWithCategory extends NavLink {
  nav_categories: {
    name: string;
    slug: string;
  } | null;
}

/** 判断链接类型 */
export function getLinkType(slug: string | null): "official" | "relay" | "model" | "neutral" {
  if (slug === "model-ranking") return "model";
  return "neutral";
}

/** 相对时间格式化（基于日历月份精确计算） */
export function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const now = new Date();
  const date = new Date(dateStr);
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;

  // 基于日历月份精确计算（而非简单除以 30）
  const months =
    (now.getFullYear() - date.getFullYear()) * 12 +
    (now.getMonth() - date.getMonth());
  // 如果天数不足，月份减 1（例如 1 月 15 日到 2 月 10 日不到 1 个月）
  if (now.getDate() < date.getDate() && months > 0) {
    if (months - 1 >= 12) {
      const years = Math.floor((months - 1) / 12);
      return `${years}年前`;
    }
    return `${months - 1}个月前`;
  }
  if (months >= 12) {
    const years = Math.floor(months / 12);
    return `${years}年前`;
  }
  return `${months}个月前`;
}

// ── 工具评价 ──

export interface ToolReview {
  id: string;
  link_id: string;
  ip: string;
  rating: number;
  comment: string | null;
  approved: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReviewStats {
  review_count: number;
  avg_rating: number;
  five_star_count: number;
  four_star_count: number;
  three_star_count: number;
  two_star_count: number;
  one_star_count: number;
}

// ── 模型排行榜 ──

export interface ModelRanking {
  id: string;
  rank: number;
  model_name: string;
  source: string;
  score: string | null;
  description: string | null;
  icon: string;
  url: string | null;
  category: string;
}
