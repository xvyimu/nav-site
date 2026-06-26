"use client";

import { type KeyboardEvent } from "react";
import { type NavLink } from "@/lib/types";
import { motion } from "motion/react";
import { fadeInUp } from "@/lib/animations";
import { ResultGrid } from "./ResultGrid";
import { Flame } from "lucide-react";

interface DualTrackSectionProps {
  featured: NavLink[];
  latest: NavLink[];
  popular: NavLink[];
  featuredOffset: number;
  focusedIndex: number;
  onFocusChange: (index: number) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>, index: number) => void;
  searchQuery?: string;
}

export function DualTrackSection({
  featured,
  latest,
  popular,
  featuredOffset,
  focusedIndex,
  onFocusChange,
  onKeyDown,
  searchQuery = "",
}: DualTrackSectionProps) {
  return (
    <>
      {/* Featured — 主推区，heading 使用 primary 色更醒目 */}
      {featured.length > 0 && (
        <motion.section variants={fadeInUp}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary flex items-center gap-2">
            <span className="inline-block w-4 h-px bg-primary/60" />
            推荐
          </h2>
          <ResultGrid
            links={featured}
            baseIndex={featuredOffset}
            focusedIndex={focusedIndex}
            onFocusChange={onFocusChange}
            onKeyDown={onKeyDown}
            searchQuery={searchQuery}
          />
        </motion.section>
      )}

      {/* Latest — 中性灰，与 Featured 区分层级 */}
      {latest.length > 0 && (
        <motion.section variants={fadeInUp}>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <span className="inline-block w-4 h-px bg-emerald-500/40" />
            最新添加
          </h2>
          <ResultGrid
            links={latest}
            baseIndex={featuredOffset + featured.length}
            focusedIndex={focusedIndex}
            onFocusChange={onFocusChange}
            onKeyDown={onKeyDown}
            searchQuery={searchQuery}
          />
        </motion.section>
      )}

      {/* Popular — 暖色调（Flame 图标），与 Latest 的冷色调形成节奏 */}
      {popular.length > 0 && (
        <motion.section variants={fadeInUp}>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Flame className="h-3.5 w-3.5 text-orange-500/70" />
            热门访问
          </h2>
          <ResultGrid
            links={popular}
            baseIndex={featuredOffset + featured.length + latest.length}
            focusedIndex={focusedIndex}
            onFocusChange={onFocusChange}
            onKeyDown={onKeyDown}
            searchQuery={searchQuery}
          />
        </motion.section>
      )}
    </>
  );
}
