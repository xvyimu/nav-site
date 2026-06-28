"use client";

import { useEffect, useRef } from "react";
import { ExternalLink, Globe, Heart, Sparkles, Star, Tags, X } from "lucide-react";
import { useFavoritesContext } from "@/components/FavoritesProvider";
import { extractDomain, isSafeUrl } from "@/lib/utils";
import type { NavLink } from "@/lib/types";

interface ToolQuickViewProps {
  link: NavLink | null;
  onClose: () => void;
}

export function ToolQuickView({ link, onClose }: ToolQuickViewProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const { isFavorite, toggleFavorite } = useFavoritesContext();

  // 存储触发按钮引用，用于关闭后返回焦点
  useEffect(() => {
    if (link) {
      triggerRef.current = document.activeElement as HTMLElement;
    }
  }, [link]);

  useEffect(() => {
    if (!link) return;

    closeRef.current?.focus();
    const dialog = dialogRef.current;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      // 焦点陷阱：Tab 在对话框内循环
      if (event.key === "Tab" && dialog) {
        const focusable = dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // 关闭后焦点回到触发按钮
      triggerRef.current?.focus();
    };
  }, [link, onClose]);

  if (!link) return null;

  const domain = extractDomain(link.url);
  const safeUrl = isSafeUrl(link.url) ? link.url : "#";
  const favorite = isFavorite(link.id);
  const rating = typeof link.avg_rating === "number" ? link.avg_rating : null;
  const tags = link.tags ?? [];

  /** 显示满 5 颗星，filled 为实际分数近似 */
  const stars = rating !== null
    ? Array.from({ length: 5 }, (_, i) => {
        const threshold = i + 0.5;
        if (rating >= threshold + 0.5) return "full";
        if (rating >= threshold) return "half";
        return "empty";
      })
    : null;

  const handleOpen = () => {
    navigator.sendBeacon(
      "/api/click",
      new Blob([JSON.stringify({ url: link.url })], { type: "application/json" }),
    );
  };

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="tool-quick-view-title" aria-describedby="tool-quick-view-desc">
      <button
        type="button"
        className="absolute inset-0 h-full w-full cursor-default bg-black/58 backdrop-blur-sm"
        aria-label="关闭工具预览"
        onClick={onClose}
      />
      <aside ref={dialogRef} id="tool-quick-view-desc" className="nav-quick-view absolute inset-x-3 bottom-3 max-h-[86svh] overflow-y-auto rounded-3xl border border-white/14 bg-[#08110f]/94 p-4 text-white shadow-[0_30px_100px_rgba(0,0,0,0.48)] backdrop-blur-2xl md:inset-y-4 md:left-auto md:right-4 md:w-[430px] md:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-2 flex items-center gap-2 text-xs font-mono uppercase text-white/52">
              <Globe className="h-3.5 w-3.5" aria-hidden="true" />
              {domain || "external tool"}
            </p>
            <h2 id="tool-quick-view-title" className="text-2xl font-semibold leading-tight text-white">
              {link.title}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white/58 transition hover:bg-white/12 hover:text-white"
            aria-label="关闭工具预览"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {link.description && (
          <p className="mt-5 text-sm leading-6 text-white/72">
            {link.description}
          </p>
        )}

        <div className="mt-5 grid grid-cols-3 gap-3">
          <Fact label="分类" value={link.category_name || "未分类"} />
          <Fact label="点击量" value={String(link.click_count ?? 0)} />
          <Fact label="评分" value={rating !== null ? `${rating.toFixed(1)}/5` : "暂无"} stars={stars} rating={rating} />
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.045] p-3">
          <div className="text-xs font-mono uppercase text-white/42">收录说明</div>
          <p className="mt-2 text-sm leading-6 text-white/68">
            {link.featured
              ? "该工具被标记为精选收录，出现在优先发现集中。"
              : "该工具已通过审核纳入导航图谱，可直接从卡片或此预览打开访问。"}
          </p>
          <div className="mt-3 truncate rounded-full bg-white/8 px-3 py-2 font-mono text-xs text-white/48">
            {safeUrl}
          </div>
        </div>

        {link.searchMeta && (
          <div className="mt-5 rounded-2xl border border-emerald-200/14 bg-emerald-200/[0.06] p-3">
            <div className="flex items-center gap-2 text-xs font-mono uppercase text-emerald-100">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              匹配解释
            </div>
            <p className="mt-2 text-sm leading-6 text-white/72">
              {link.searchMeta.explanation.reason}
            </p>
            {link.searchMeta.highlights.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {link.searchMeta.highlights.slice(0, 4).map((highlight) => (
                  <span key={`${highlight.field}:${highlight.value}`} className="rounded-full bg-white/10 px-2 py-1 text-xs text-white/64">
                    {highlight.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {tags.length > 0 && (
          <div className="mt-5" aria-labelledby="tool-quick-view-tags">
            <h3 id="tool-quick-view-tags" className="mb-2 flex items-center gap-2 text-xs font-mono uppercase text-white/52">
              <Tags className="h-3.5 w-3.5" aria-hidden="true" />
              标签
            </h3>
            <ul className="flex flex-wrap gap-2" role="list">
              {tags.slice(0, 10).map((tag) => (
                <li key={tag.id} className="rounded-full border border-white/12 bg-white/[0.06] px-2.5 py-1 text-xs text-white/68">
                  {tag.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <a
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleOpen}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-[#07100f] transition hover:bg-emerald-50"
          >
            打开网站
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
          <button
            type="button"
            onClick={() => toggleFavorite(link.id)}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-white/14 bg-white/8 text-sm font-semibold text-white transition hover:bg-white/12"
            aria-pressed={favorite}
          >
            <Heart className={`h-4 w-4 ${favorite ? "fill-emerald-200 text-emerald-200" : ""}`} aria-hidden="true" />
            {favorite ? "已收藏" : "收藏"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function Fact({ label, value, stars, rating }: { label: string; value: string; stars?: ("full" | "half" | "empty")[] | null; rating?: number | null }) {
  return (
    <dl className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
      <div className="flex items-center gap-1.5 text-lg font-semibold text-white">
        {label === "评分" && stars && (
          <span className="flex gap-0.5 text-amber-200" aria-label={`评分 ${rating?.toFixed(1) || "暂无"} 分`}>
            {stars.map((star, i) => (
              <Star
                key={i}
                className={`h-4 w-4 ${star === "full" ? "fill-current" : star === "half" ? "fill-current opacity-50" : "text-white/30"}`}
                aria-hidden="true"
              />
            ))}
          </span>
        )}
        {label !== "评分" && <dt className="truncate">{value}</dt>}
      </div>
      <dd className="mt-1 text-[10px] font-mono uppercase text-white/42">{label}</dd>
    </dl>
  );
}
