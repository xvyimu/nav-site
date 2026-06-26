"use client";

import type { NavLinkWithCategory } from "@/lib/types";

interface Props {
  links: NavLinkWithCategory[];
  onEdit: (link: NavLinkWithCategory) => void;
  onDelete: (id: string, title: string) => void;
  onAdd?: () => void;
}

export function LinkList({ links, onEdit, onDelete }: Props) {
  return (
    <div className="space-y-2">
      {links.map(link => (
        <div key={link.id}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition hover:bg-white/[0.08]"
        >
          <span className="text-lg">{link.icon || "🔗"}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-white">{link.title}</span>
              {!link.approved && <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] text-yellow-400">待审</span>}
              {link.featured && <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] text-purple-400">推荐</span>}
            </div>
            <div className="flex items-center gap-3 text-xs text-white/40">
              <span className="truncate">{link.url}</span>
              <span>{link.nav_categories?.name || "未分类"}</span>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={() => onEdit(link)} aria-label={`编辑 ${link.title}`}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/60 transition hover:bg-white/20 hover:text-white">
              编辑
            </button>
            <button onClick={() => onDelete(link.id, link.title)} aria-label={`删除 ${link.title}`}
              className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-400 transition hover:bg-red-500/20">
              删除
            </button>
          </div>
        </div>
      ))}
      {links.length === 0 && (
        <p className="py-12 text-center text-white/30">暂无链接</p>
      )}
    </div>
  );
}
