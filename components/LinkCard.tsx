"use client";

import { type NavLink } from "@/lib/types";
import { motion } from "motion/react";
import { fadeInUp } from "@/lib/animations";

export function LinkCard({ link, index = 0 }: { link: NavLink; index?: number }) {
  let domain = "";
  try {
    domain = new URL(link.url).hostname.replace(/^www\./, "");
  } catch {}

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
        className="group block"
      >
        <div className="card-hover rounded-lg border border-white/10 bg-white/[0.02] p-3.5 transition-colors">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-foreground/[0.05] text-base">
              {link.icon || "🔗"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[13.5px] font-medium text-foreground/90 group-hover:text-foreground">
                  {link.title}
                </span>
                {link.featured && (
                  <span className="shrink-0 inline-flex items-center rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-normal text-primary">
                    推荐
                  </span>
                )}
              </div>
              {link.description && (
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground/60">
                  {link.description}
                </p>
              )}
              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground/40">
                <span className="font-mono">{domain}</span>
                <span>·</span>
                <span>{link.category_name || "未分类"}</span>
              </div>
            </div>
          </div>
        </div>
      </a>
    </motion.div>
  );
}
