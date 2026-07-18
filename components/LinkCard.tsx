"use client";

import { memo } from "react";
import { Eye, Globe, Sparkles } from "lucide-react";
import { FavoriteButton } from "@/components/FavoriteButton";
import { InteractiveSurface } from "@/components/ui/interactive-surface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { highlightSearchTerm } from "@/lib/highlight";
import { getLinkType, relativeTime, type NavLink } from "@/lib/types";
import { cn, extractDomain, isSafeUrl } from "@/lib/utils";
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
  // 优先业务库 icon；否则走域名代理（ResultGrid 会预热可见域名）
  const preferredIcon =
    typeof link.icon === "string" && isSafeUrl(link.icon) ? link.icon : null;
  const faviconUrl = useFavicon(preferredIcon ? null : domain, preferredIcon);

  function handleLinkClick() {
    trackClick(link.url);
  }

  const badgeStyle =
    type === "official"
      ? "text-[var(--paper-accent)]"
      : type === "relay"
        ? "text-[#b58157]"
        : "text-[#6f8c74]";

  return (
    <div
      className="animate-fade-in-up"
      style={{ animationDelay: `${(index % 20) * 0.02}s` }}
    >
      {/* 外层 article：主链与按钮为兄弟，避免 <a> 嵌套交互控件 */}
      <article className="group relative">
        <InteractiveSurface
          className="min-h-[74px] rounded-xl border border-[var(--paper-line)] bg-[var(--paper-surface)] px-3.5 py-3 text-[var(--paper-ink)] shadow-[0_10px_28px_rgba(61,74,90,0.06)] card-hover"
          spotlight={false}
        >
          <div className="flex min-h-[46px] items-center gap-3">
            <a
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleLinkClick}
              className="flex min-w-0 flex-1 items-center gap-3 outline-none"
              aria-label={`${link.title}${link.description ? ` - ${link.description}` : ""}`}
            >
              <div
                className="flex size-[42px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--paper-line)] bg-[var(--paper-surface-soft)] transition-all duration-200"
                style={{ transform: "scale(var(--card-icon-scale))" }}
              >
                {faviconUrl ? (
                  // 代理图用原生 img，避免 next/image 额外调度；固定尺寸防 CLS
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={faviconUrl}
                    alt=""
                    width={24}
                    height={24}
                    loading="lazy"
                    decoding="async"
                    className="size-6 rounded"
                  />
                ) : (
                  <Globe className="size-5 text-[var(--paper-faint)]" />
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                <div className="flex items-center gap-2">
                  <span className="card-hover-title truncate text-[13.5px] font-medium text-[var(--paper-ink)] transition-colors duration-200">
                    {highlightSearchTerm(link.title, searchQuery)}
                  </span>
                  {link.featured && (
                    <Badge variant="accent" className="shrink-0 px-1.5 py-[1px]">
                      荐
                    </Badge>
                  )}
                  {type === "official" && (
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center text-[10px] font-medium",
                        badgeStyle
                      )}
                    >
                      ●
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 truncate text-[11px] text-[var(--paper-muted)]">
                  <span className="truncate font-mono">{domain}</span>
                  {ts && (
                    <>
                      <span aria-hidden="true">/</span>
                      <span className="shrink-0">{ts}</span>
                    </>
                  )}
                </div>
                {searchMeta && (
                  <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-[var(--paper-muted)]">
                    <Sparkles
                      className="size-3 shrink-0 text-[var(--paper-accent)]"
                      aria-hidden="true"
                    />
                    <span className="truncate">{searchMeta.explanation.reason}</span>
                    <Badge
                      variant="accent"
                      className="shrink-0 px-1 py-[1px] text-[9px]"
                    >
                      {searchMeta.explanation.label}
                    </Badge>
                  </div>
                )}
              </div>
            </a>

            <FavoriteButton linkId={link.id} />
            {onPreview && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      // 确保触发按钮持有焦点，便于关闭预览后还原
                      event.currentTarget.focus();
                      onPreview(link);
                    }}
                    className="shrink-0 text-[var(--paper-faint)]"
                    aria-label={`预览 ${link.title}`}
                  >
                    <Eye className="size-3.5" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>快速预览</TooltipContent>
              </Tooltip>
            )}
          </div>
        </InteractiveSurface>
      </article>
    </div>
  );
}

export const LinkCard = memo(LinkCardComponent);
