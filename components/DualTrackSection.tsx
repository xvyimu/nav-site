"use client";

import { type KeyboardEvent } from "react";
import { type NavLink } from "@/lib/types";
import { motion } from "motion/react";
import { fadeInUp } from "@/lib/animations";
import { LinkCard } from "./LinkCard";

interface DualTrackSectionProps {
  featured: NavLink[];
  latest: NavLink[];
  featuredOffset: number;
  focusedIndex: number;
  onFocusChange: (index: number) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>, index: number) => void;
}

export function DualTrackSection({
  featured,
  latest,
  featuredOffset,
  focusedIndex,
  onFocusChange,
  onKeyDown,
}: DualTrackSectionProps) {
  return (
    <>
      {/* Featured */}
      {featured.length > 0 && (
        <motion.section variants={fadeInUp}>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <span className="inline-block w-4 h-px bg-primary/40" />
            推荐
          </h2>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" role="list" aria-label="推荐站点">
            {featured.map((link, i) => {
              const idx = featuredOffset + i;
              return (
                <motion.div layout key={link.id}
                  id={`result-${idx}`}
                  role="listitem"
                  data-result-index={idx}
                  data-focused={focusedIndex === idx ? "true" : undefined}
                  onMouseEnter={() => onFocusChange(idx)}
                  onMouseLeave={() => onFocusChange(-1)}
                  onKeyDown={(e) => onKeyDown(e, idx)}
                  tabIndex={focusedIndex === idx ? 0 : -1}
                  className="outline-none rounded-xl transition-all duration-150"
                >
                  <LinkCard link={link} index={idx} />
                </motion.div>
              );
            })}
          </div>
        </motion.section>
      )}

      {/* Latest */}
      {latest.length > 0 && (
        <motion.section variants={fadeInUp}>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <span className="inline-block w-4 h-px bg-green-500/40" />
            最新添加
          </h2>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" role="list" aria-label="最新添加">
            {latest.map((link, i) => {
              const idx = featuredOffset + featured.length + i;
              return (
                <motion.div layout key={link.id}
                  id={`result-${idx}`}
                  role="listitem"
                  data-result-index={idx}
                  data-focused={focusedIndex === idx ? "true" : undefined}
                  onMouseEnter={() => onFocusChange(idx)}
                  onMouseLeave={() => onFocusChange(-1)}
                  onKeyDown={(e) => onKeyDown(e, idx)}
                  tabIndex={focusedIndex === idx ? 0 : -1}
                  className="outline-none rounded-xl transition-all duration-150"
                >
                  <LinkCard link={link} index={idx} />
                </motion.div>
              );
            })}
          </div>
        </motion.section>
      )}
    </>
  );
}