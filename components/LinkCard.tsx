"use client";

import { memo } from "react";
import NextImage from "next/image";
import { Eye, Globe, Heart, Sparkles } from "lucide-react";
import { useFavoritesContext } from "@/components/FavoritesProvider";
import { highlightSearchTerm } from "@/lib/highlight";
import { getLinkType, relativeTime, type NavLink } from "@/lib/types";
import { extractDomain, isSafeUrl } from "@/lib/utils";
import { useFavicon } from "@/lib/use-favicon";
import { trackClick } from "@/lib/track-click";

function LinkCardComponent({
  link,
  index = 0,
  searchQuery = "",
  onPreview,
}: {
  link: NavLink;
  index?: number;
  searchQuery?: string;
  onPreview?: (link: NavLink) => void;
}) {
  const domain = extractDomain(link.url);
  const safeUrl = isSafeUrl(link.url) ? link.url : "#";
  const type = getLinkType(link.category_slug ?? null);
  const ts = relativeTime(link.updated_at || link.created_at);
  const searchMeta = link.searchMeta;
  const { isFavorite, toggleFavorite } = useFavoritesContext();
  const fav = isFavorite(link.id);
  const faviconUrl = useFavicon(domain);

  function handleFavoriteClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(link.id);
  }

  function handleLinkClick() {
    trackClick(link.url);
  }

  const badgeStyle =
    type === "official"
      ? "text-sky-200"
      : type === "relay"
        ? "text-amber-200"
        : type === "model"
          ? "text-violet-200"
          : "text-emerald-100";

  return (
    <div
      className="animate-fade-in-up"
      style={{ animationDelay: `${(index % 20) * 0.02}s` }}
    >
      <a
        href={safeUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleLinkClick}
        className="group block"
        aria-label={`${link.title}${link.description ? ` - ${link.description}` : ""}`}
      >
        <div className="relative min-h-[74px] overflow-hidden rounded-xl border border-white/10 bg-white/[0.075] px-3.5 py-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md card-hover">
          <div className="flex min-h-[46px] items-center gap-3">
            <div
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/10 transition-all duration-200"
              style={{ transform: "scale(var(--card-icon-scale))" }}
            >
              {faviconUrl ? (
                <NextImage
                  src={faviconUrl}
                  alt=""
                  width={24}
                  height={24}
                  className="rounded"
                  unoptimized
                />
              ) : (
                <Globe className="h-5 w-5 text-white/45" />
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
              <div className="flex items-center gap-2">
                <span className="card-hover-title truncate text-[13.5px] font-medium text-white transition-colors duration-200">
                  {highlightSearchTerm(link.title, searchQuery)}
                </span>
                {link.featured && (
                  <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-200/12 px-1.5 py-[1px] text-[10px] font-medium text-emerald-100">
                    荐
                  </span>
                )}
                {type === "official" && (
                  <span className={`inline-flex shrink-0 items-center text-[10px] font-medium ${badgeStyle}`}>
                    ●
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 truncate text-[11px] text-white/52">
                <span className="truncate font-mono">{domain}</span>
                {ts && (
                  <>
                    <span aria-hidden="true">/</span>
                    <span className="shrink-0">{ts}</span>
                  </>
                )}
              </div>
              {searchMeta && (
                <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-white/58">
                  <Sparkles className="h-3 w-3 shrink-0 text-emerald-200/80" aria-hidden="true" />
                  <span className="truncate">{searchMeta.explanation.reason}</span>
                  <span className="shrink-0 rounded bg-white/10 px-1 py-[1px] text-[9px] text-white/62">
                    {searchMeta.explanation.label}
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={handleFavoriteClick}
              className="shrink-0 rounded-md p-1.5 text-white/32 transition-colors hover:bg-white/10 hover:text-emerald-100"
              aria-label={fav ? "取消收藏" : "添加收藏"}
              aria-pressed={fav}
            >
              <Heart className={`h-3.5 w-3.5 transition-all ${fav ? "fill-emerald-200 text-emerald-200" : ""}`} />
            </button>
            {onPreview && (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onPreview(link);
                }}
                className="shrink-0 rounded-md p-1.5 text-white/32 transition-colors hover:bg-white/10 hover:text-emerald-100"
                aria-label={`预览 ${link.title}`}
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </a>
    </div>
  );
}

export const LinkCard = memo(LinkCardComponent);
