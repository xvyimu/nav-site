export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
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
  // Joined field
  category_name?: string;
  category_slug?: string;
}

export interface NavLinkWithCategory extends NavLink {
  nav_categories: {
    name: string;
    slug: string;
  } | null;
}

/** 判断链接类型 */
export function getLinkType(slug: string | null): "official" | "relay" | "model" | "neutral" {
  if (slug === "big-tech") return "official";
  if (slug === "free-relay") return "relay";
  if (slug === "model-ranking") return "model";
  return "neutral";
}

/** 相对时间格式化 */
export function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  const months = Math.floor(days / 30);
  return `${months}个月前`;
}
