"use client";

import { useState, useEffect, memo } from "react";
import NextImage from "next/image";
import { type NavLink, getLinkType, relativeTime } from "@/lib/types";
import { motion } from "motion/react";
import { fadeInUp } from "@/lib/animations";
import { Globe, Heart, Sparkles } from "lucide-react";
import { useFavoritesContext } from "@/components/FavoritesProvider";
import { isSafeUrl, extractDomain } from "@/lib/utils";
import { highlightSearchTerm } from "@/lib/highlight";

function LinkCardComponent({ link, index = 0, searchQuery = "" }: { link: NavLink; index?: number; searchQuery?: string }) {
  const domain = extractDomain(link.url);
  const safeUrl = isSafeUrl(link.url) ? link.url : "#";
  const type = getLinkType(link.category_slug ?? null);
  const ts = relativeTime(link.updated_at || link.created_at);
  const searchMeta = link.searchMeta;

  const { isFavorite, toggleFavorite } = useFavoritesContext();
  const fav = isFavorite(link.id);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(link.id);
  }

  function handleLinkClick() {
    navigator.sendBeacon(
      "/api/click",
      new Blob([JSON.stringify({ url: link.url })], { type: "application/json" }),
    );
  }

  // ── Favicon pre-loading via local API proxy ──
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!domain) return;

    let cancelled = false;

    // v=2 用于绕过 Cloudflare 对旧版 404 响应的缓存
    const proxyUrl = `/api/favicon?domain=${encodeURIComponent(domain)}&v=2`;

    const img = new Image();
    img.onload = () => {
      if (!cancelled) setFaviconUrl(proxyUrl);
    };
    img.onerror = () => {
      if (cancelled) return;
      // 备用：直接加载 Google S2 favicon
      const fallbackUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
      const img2 = new Image();
      img2.onload = () => {
        if (!cancelled) setFaviconUrl(fallbackUrl);
      };
      img2.src = fallbackUrl;
    };
    img.src = proxyUrl;

    return () => { cancelled = true; };
  }, [domain]);

  // Badge color per type
  const badgeStyle =
    type === "official"
      ? "text-blue-600 dark:text-blue-400"
      : type === "relay"
        ? "text-amber-600 dark:text-amber-400"
        : type === "model"
          ? "text-purple-600 dark:text-purple-400"
          : "text-primary";

  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="show"
      transition={{ delay: (index % 20) * 0.02 }}
    >
      <a
        href={safeUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleLinkClick}
        className="group block"
        aria-label={`${link.title}${link.description ? ` — ${link.description}` : ""}`}
      >
        <div className="relative min-h-[68px] rounded-xl border border-border/70 bg-card px-3.5 py-3 card-hover overflow-hidden">
          <div className="flex items-center gap-3 min-h-[44px]">
            {/* Favicon / Icon */}
            <div
              className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-lg bg-muted overflow-hidden transition-all duration-200"
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
                <Globe className="h-5 w-5 text-muted-foreground/50" />
              )}
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
              <div className="flex items-center gap-2">
                <span className="card-hover-title truncate text-[13.5px] font-medium text-foreground transition-colors duration-200">
                  {highlightSearchTerm(link.title, searchQuery)}
                </span>
                {/* Inline badges */}
                {link.featured && (
                  <span className="shrink-0 inline-flex items-center rounded-full bg-primary/10 px-1.5 py-[1px] text-[10px] font-medium text-primary">
                    荐
                  </span>
                )}
                {type === "official" && (
                  <span className={`shrink-0 inline-flex items-center text-[10px] font-medium ${badgeStyle}`}>
                    ●
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground truncate">
                <span className="font-mono truncate">{domain}</span>
                {ts && <><span aria-hidden="true">·</span><span className="shrink-0">{ts}</span></>}
              </div>
              {searchMeta && (
                <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground/70">
                  <Sparkles className="h-3 w-3 shrink-0 text-primary/70" aria-hidden="true" />
                  <span className="truncate">{searchMeta.explanation.reason}</span>
                  <span className="shrink-0 rounded bg-muted px-1 py-[1px] text-[9px] text-muted-foreground">
                    {searchMeta.explanation.label}
                  </span>
                </div>
              )}
            </div>

            {/* Favorite toggle */}
            <button
              onClick={handleClick}
              className="shrink-0 p-1.5 rounded-md text-muted-foreground/30 hover:text-primary hover:bg-primary/5 transition-colors"
              aria-label={fav ? "取消收藏" : "添加收藏"}
              aria-pressed={fav}
            >
              <Heart
                className={`h-3.5 w-3.5 transition-all ${
                  fav ? "fill-primary text-primary" : ""
                }`}
              />
            </button>
          </div>
        </div>
      </a>
    </motion.div>
  );
}

export const LinkCard = memo(LinkCardComponent);
