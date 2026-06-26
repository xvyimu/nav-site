"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { staggerContainer, fadeInUp } from "@/lib/animations";
import { RANK_COLORS, RANK_BG_COLORS } from "@/lib/nav-config";
import type { ModelRanking } from "@/lib/types";

export function ModelRanking({ data }: { data: ModelRanking[] }) {
  const sorted = useMemo(
    () => [...data].sort((a, b) => a.rank - b.rank),
    [data],
  );

  return (
    <motion.div className="space-y-6" variants={staggerContainer} initial="hidden" animate="show">
      <motion.h2 variants={fadeInUp} className="text-xs font-medium uppercase tracking-widest text-primary/60 flex items-center gap-2">
        <span className="inline-block w-4 h-px bg-current opacity-40" />
        用户最爱排行榜
        <span className="text-muted-foreground/40 font-normal normal-case tracking-normal">（综合 Chatbot Arena · SuperCLUE · 用户投票）</span>
      </motion.h2>

      <div className="space-y-2">
        {sorted.map((item, i) => (
          <RankingRow key={item.id} item={item} index={i} />
        ))}
      </div>

      {sorted.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground/40">暂无排行数据</p>
      )}
    </motion.div>
  );
}

function RankingRow({ item, index }: { item: ModelRanking; index: number }) {
  const content = (
    <div className={`flex items-start gap-3 p-3 rounded-lg border border-border transition-all hover:border-primary/30 hover:shadow-sm ${index < 3 ? RANK_BG_COLORS[index] : ""}`}>
      {/* Rank badge */}
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold ${
        index === 0 ? RANK_COLORS[0] : index === 1 ? RANK_COLORS[1] : index === 2 ? RANK_COLORS[2] : "text-muted-foreground/40"
      }`}>
        {item.rank}
      </div>

      {/* Icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-base">
        {item.icon}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="truncate text-sm font-medium text-foreground/85">
            {item.model_name}
          </span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border
            ${item.category === "open" ? "text-emerald-600 border-emerald-200 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/30"
            : "text-blue-600 border-blue-200 bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-950/30"}`}
          >
            {item.category === "open" ? "开源" : "闭源"}
          </span>
        </div>
        {item.description && (
          <p className="mt-0.5 text-xs text-muted-foreground/60 line-clamp-1">{item.description}</p>
        )}
      </div>

      {/* Score */}
      {item.score && (
        <div className="shrink-0 text-right">
          <span className="text-xs font-semibold text-primary/80">{item.score}</span>
        </div>
      )}
    </div>
  );

  if (item.url) {
    const safeUrl = (() => {
      try {
        const parsed = new URL(item.url);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch { return false; }
    })();
    return (
      <motion.div variants={fadeInUp} transition={{ delay: index * 0.03 }}>
        {safeUrl ? (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">
            {content}
          </a>
        ) : (
          <div className="block">{content}</div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div variants={fadeInUp} transition={{ delay: index * 0.03 }}>
      {content}
    </motion.div>
  );
}