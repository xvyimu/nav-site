"use client";

import { useState, useMemo } from "react";
import { motion } from "motion/react";
import { staggerContainer, fadeInUp } from "@/lib/animations";

export interface ModelRanking {
  id: string;
  rank: number;
  model_name: string;
  source: string;
  score: string | null;
  description: string | null;
  icon: string;
  url: string | null;
  category: string;
}

const sourceLabels: Record<string, string> = {
  "综合旗舰": "综合旗舰（闭源）",
  "开源模型": "开源模型 TOP5",
  "Chatbot Arena": "Chatbot Arena（斯坦福）",
  "SuperCLUE": "SuperCLUE 中文榜",
  "能力冠军": "分能力单项冠军",
};

const sourceColors: Record<string, string> = {
  "综合旗舰": "text-blue-600 dark:text-blue-400",
  "开源模型": "text-emerald-600 dark:text-emerald-400",
  "Chatbot Arena": "text-violet-600 dark:text-violet-400",
  "SuperCLUE": "text-amber-600 dark:text-amber-400",
  "能力冠军": "text-rose-600 dark:text-rose-400",
};

export function ModelRanking({ data }: { data: ModelRanking[] }) {
  const [activeSource, setActiveSource] = useState("all");

  const sources = useMemo(() => {
    const seen = new Set<string>();
    for (const item of data) {
      if (!seen.has(item.source)) {
        seen.add(item.source);
      }
    }
    return Array.from(seen);
  }, [data]);

  const filtered = useMemo(() => {
    if (activeSource === "all") return data;
    return data.filter((r) => r.source === activeSource);
  }, [data, activeSource]);

  const grouped = useMemo(() => {
    const map = new Map<string, ModelRanking[]>();
    for (const item of filtered) {
      const list = map.get(item.source) ?? [];
      list.push(item);
      map.set(item.source, list);
    }
    return map;
  }, [filtered]);

  return (
    <motion.div className="space-y-6" variants={staggerContainer} initial="hidden" animate="show">
      {/* Source tabs */}
      <motion.div variants={fadeInUp} className="flex items-center gap-1 border-b border-border pb-1 overflow-x-auto">
        <button
          onClick={() => setActiveSource("all")}
          className={`px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors relative ${
            activeSource === "all" ? "text-foreground" : "text-muted-foreground/50 hover:text-foreground/70"
          }`}
        >
          全部榜单
          {activeSource === "all" && (
            <motion.div layoutId="ranking-source" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
        {sources.map((src) => (
          <button
            key={src}
            onClick={() => setActiveSource(src)}
            className={`px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors relative ${
              activeSource === src ? "text-foreground" : "text-muted-foreground/50 hover:text-foreground/70"
            }`}
          >
            {sourceLabels[src] || src}
            {activeSource === src && (
              <motion.div layoutId="ranking-source" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        ))}
      </motion.div>

      {/* Rankings */}
      {Array.from(grouped.entries()).map(([src, items]) => (
        <motion.section key={src} variants={fadeInUp}>
          {activeSource === "all" && (
            <h2 className={`mb-3 text-xs font-medium uppercase tracking-widest ${sourceColors[src] || "text-muted-foreground/50"} flex items-center gap-2`}>
              <span className="inline-block w-4 h-px bg-current opacity-40" />
              {sourceLabels[src] || src}
            </h2>
          )}
          <div className="space-y-2">
            {items
              .sort((a, b) => a.rank - b.rank)
              .map((item, i) => (
                <RankingRow key={item.id} item={item} index={i} />
              ))}
          </div>
        </motion.section>
      ))}

      {filtered.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground/40">暂无排行数据</p>
      )}
    </motion.div>
  );
}

function RankingRow({ item, index }: { item: ModelRanking; index: number }) {
  const rankColors = ["text-amber-500", "text-gray-400", "text-amber-700"];
  const bgColors = ["bg-amber-50 dark:bg-amber-950/20", "bg-gray-50 dark:bg-gray-800/20", "bg-amber-50/50 dark:bg-amber-950/10"];

  const content = (
    <div className={`flex items-start gap-3 p-3 rounded-lg border border-border transition-all hover:border-primary/30 hover:shadow-sm ${index < 3 ? bgColors[index] : ""}`}>
      {/* Rank badge */}
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold ${
        index === 0 ? rankColors[0] : index === 1 ? rankColors[1] : index === 2 ? rankColors[2] : "text-muted-foreground/40"
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
    return (
      <motion.div variants={fadeInUp} transition={{ delay: index * 0.03 }}>
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">
          {content}
        </a>
      </motion.div>
    );
  }

  return (
    <motion.div variants={fadeInUp} transition={{ delay: index * 0.03 }}>
      {content}
    </motion.div>
  );
}