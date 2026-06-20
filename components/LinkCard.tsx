"use client";

import { type NavLink, getLinkType, relativeTime } from "@/lib/types";
import { motion } from "motion/react";
import { fadeInUp } from "@/lib/animations";

export function LinkCard({ link, index = 0 }: { link: NavLink; index?: number }) {
  let domain = "";
  try {
    domain = new URL(link.url).hostname.replace(/^www\./, "");
  } catch {}

  const type = getLinkType(link.category_slug ?? null);
  const ts = relativeTime(link.updated_at || link.created_at);

  function handleClick() {
    // Fire-and-forget click tracking
    fetch("/api/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: link.url }),
    }).catch(() => {});
  }

  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="show"
      transition={{ delay: index * 0.025 }}
    >
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className="group block"
      >
        <div
          className={`relative rounded-lg border bg-card p-4 card-hover ${
            type === "official"
              ? "border-l-[3px] border-l-primary"
              : type === "relay"
              ? "border-l-[3px] border-l-amber-400"
              : ""
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-base">
              {link.icon || "🔗"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="truncate text-sm font-medium text-foreground/85 group-hover:text-foreground">
                  {link.title}
                </span>
                {link.featured && (
                  <span className="shrink-0 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    推荐
                  </span>
                )}
                {type === "official" && (
                  <span className="shrink-0 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600 border border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800">
                    官方
                  </span>
                )}
                {type === "relay" && (
                  <span className="shrink-0 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                    中转
                  </span>
                )}
              </div>
              {link.description && (
                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground/60">
                  {link.description}
                </p>
              )}
              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground/40">
                <span className="font-mono">{domain}</span>
                {ts && <><span>·</span><span>{ts}</span></>}
                {link.click_count > 0 && <><span>·</span><span>{link.click_count} 次点击</span></>}
              </div>
            </div>
          </div>
        </div>
      </a>
    </motion.div>
  );
}