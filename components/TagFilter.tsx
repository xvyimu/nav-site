"use client";

import { Tag as TagIcon, X } from "lucide-react";
import type { Tag } from "@/lib/types";

interface TagFilterProps {
  /** 可选标签列表（按名称排序） */
  tags: Tag[];
  /** 当前选中的标签 slug 列表 */
  activeTags: string[];
  /** 切换某个标签的选中状态 */
  onToggleTag: (slug: string) => void;
  /** 清除所有标签筛选 */
  onClear: () => void;
}

/**
 * 多标签交叉筛选组件
 *
 * 渲染在 Sidebar 中，让用户通过点击标签来筛选链接。
 * 多标签使用 AND 语义：必须同时拥有所有选中标签才会展示。
 */
export function TagFilter({ tags, activeTags, onToggleTag, onClear }: TagFilterProps) {
  if (tags.length === 0) return null;

  return (
    <div className="px-3 py-3 border-t border-border/50 mt-2">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <TagIcon className="h-3 w-3" aria-hidden="true" />
          标签筛选
        </span>
        {activeTags.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            aria-label="清除所有标签筛选"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            清除
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => {
          const active = activeTags.includes(tag.slug);
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => onToggleTag(tag.slug)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              }`}
              aria-pressed={active}
            >
              {tag.name}
            </button>
          );
        })}
      </div>
      {activeTags.length > 0 && (
        <p className="mt-2 px-1 text-[11px] text-muted-foreground">
          已选 {activeTags.length} 个标签（同时满足）
        </p>
      )}
    </div>
  );
}
