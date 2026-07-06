import type { NavLink } from "@/lib/types";

export type SortMode = "default" | "newest" | "popular";

export interface LinkResultItem {
  type: "link";
  link: NavLink;
}

export interface LinkSection {
  key: string;
  links: NavLink[];
  label: string;
  accent: string;
}
