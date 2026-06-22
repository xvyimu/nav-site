"use client";

import { type NavLink, getLinkType, relativeTime } from "@/lib/types";
import { motion } from "motion/react";
import { fadeInUp } from "@/lib/animations";

export function LinkCard({ link, index = 0 }: { link: NavLink; index?: number }) {
  function isSafeUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  let domain = "";
  try {
    domain = new URL(link.url).hostname.replace(/^www\./, "");
  } catch {}

  const safeUrl = isSafeUrl(link.url) ? link.url : "#";
  const type = getLinkType(link.category_slug ?? null);
  const ts = relativeTime(link.updated_at || link.created_at);

  function handleClick() {
    navigator.sendBeacon(
      "/api/click",
      new Blob([JSON.stringify({ url: link.url })], { type: "application/json" }),
    );
  }

  // ── Pink hover vars ──
  // The .card-pink class handles transform, border-color, box-shadow via CSS.
  // We add the base card styles here and toggle the class on the card wrapper.

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
        onClick={handleClick}
        className="group block"
        aria-label={`${link.title}${link.description ? ` — ${link.description}` : ""}`}
      >
        <div className="relative h-[66px] rounded-xl border border-border/70 bg-card px-3 py-2.5 card-pink overflow-hidden">
          <div className="flex items-center gap-3 h-full">
            {/* Icon */}
            <div className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-lg bg-muted text-base transition-all duration-200"
              style={{ transform: "scale(var(--card-icon-scale))", filter: "var(--card-icon-glow)" }}>
              {link.icon || "🔗"}
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
              <div className="flex items-center gap-2">
                <span className="card-pink-title truncate text-[13px] font-medium text-foreground/85 transition-colors duration-200">
                  {link.title}
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
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 truncate">
                <span className="font-mono truncate">{domain}</span>
                {ts && <><span>·</span><span className="shrink-0">{ts}</span></>}
              </div>
            </div>
          </div>
        </div>
      </a>
    </motion.div>
  );
}