"use client";

import { type KeyboardEvent, type RefObject } from "react";
import { ArrowDown, Compass, Layers3, Search, Sparkles } from "lucide-react";
import { SearchBar } from "./SearchBar";
import { AtlasPill } from "./ui/atlas-pill";

interface HeroTab {
  key: string;
  label: string;
  count: number;
}

interface HomeHeroProps {
  totalLinks: number;
  categoryCount: number;
  featuredCount: number;
  topTabs: HeroTab[];
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  searchLoading: boolean;
  semanticSearch: boolean;
  onSemanticSearchChange: (value: boolean) => void;
  activeCategory: string;
  onCategorySelect: (key: string) => void;
}

export function HomeHero({
  totalLinks,
  categoryCount,
  featuredCount,
  topTabs,
  searchValue,
  onSearchChange,
  onSearchKeyDown,
  inputRef,
  searchLoading,
  semanticSearch,
  onSemanticSearchChange,
  activeCategory,
  onCategorySelect,
}: HomeHeroProps) {
  return (
    <section className="nav-hero-bg relative isolate overflow-hidden px-4 pb-8 pt-8 md:px-8 md:pb-12">
      <div className="nav-hero-grain" aria-hidden="true" />
      <div className="relative z-10 mx-auto flex min-h-[76svh] max-w-[1480px] flex-col justify-between gap-10 py-8 md:min-h-[78svh] md:py-12">
        <div className="flex items-start justify-between gap-6">
          <div className="hidden max-w-[18rem] text-xs font-mono uppercase leading-relaxed text-white/70 md:block">
            面向 AI、云端、设计、开源与运维构建者的精选图谱
          </div>
          <div className="ml-auto flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-mono uppercase text-white/80 backdrop-blur-md">
            <Sparkles className="size-3.5 text-emerald-200" aria-hidden="true" />
            混合检索
          </div>
        </div>

        <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-2 text-white">
              <p className="flex items-center gap-2 text-xs font-mono uppercase text-white/70">
                <Compass className="size-3.5" aria-hidden="true" />
                导航图谱
              </p>
              <h1 className="nav-display max-w-6xl text-6xl leading-[0.96] text-white sm:text-7xl md:text-8xl lg:text-9xl">
                在工具荒野中
                <span className="block pl-[12%] italic text-white/90">寻得信号。</span>
                <span className="block text-right text-white/95">不再迷途。</span>
              </h1>
            </div>

            <div className="grid max-w-5xl gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <SearchBar
                value={searchValue}
                onChange={onSearchChange}
                onKeyDown={onSearchKeyDown}
                inputRef={inputRef}
                loading={searchLoading}
                semantic={semanticSearch}
                onSemanticChange={onSemanticSearchChange}
                placeholder="搜索工具、分类、标签..."
                variant="hero"
              />
              <a
                href="#atlas"
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 text-sm font-medium text-white backdrop-blur-md transition hover:border-emerald-200/50 hover:bg-white/15 focus-visible:outline-white"
              >
                探索图谱
                <ArrowDown className="size-4" aria-hidden="true" />
              </a>
            </div>
          </div>

          <aside className="nav-glass flex flex-col gap-5 p-4 text-white md:p-5" aria-label="图谱概览">
            <div className="grid grid-cols-3 gap-3">
              <Metric value={totalLinks} label="工具" />
              <Metric value={categoryCount} label="分组" />
              <Metric value={featuredCount} label="精选" />
            </div>
            <p className="text-sm leading-6 text-white/72">
              无需扫视喧嚣链接墙，安静地寻得可用工具。
            </p>
            <div className="flex flex-wrap gap-2">
              {topTabs.slice(0, 5).map((tab) => (
                <AtlasPill
                  key={tab.key}
                  onClick={() => onCategorySelect(activeCategory === tab.key ? "all" : tab.key)}
                  active={activeCategory === tab.key}
                  icon={Layers3}
                  count={tab.count}
                  pressed
                >
                  {tab.label}
                </AtlasPill>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-white/10 pt-4 text-xs font-mono uppercase text-white/58">
              <span>Cmd / Ctrl + K</span>
              <Search className="size-3.5" aria-hidden="true" />
            </div>
          </aside>
        </div>

        <div className="grid gap-4 text-xs font-mono uppercase leading-relaxed text-white/60 md:grid-cols-[180px_minmax(0,1fr)_260px]">
          <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3 backdrop-blur">
            每日精选
          </div>
          <div className="hidden md:block" />
          <p>
            先搜索，再浏览。重要的东西，不要让它们离你太远。
          </p>
        </div>
      </div>
    </section>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3">
      <div className="text-2xl font-semibold tabular-nums text-white">{value}</div>
      <div className="text-xs font-mono uppercase text-white/55">{label}</div>
    </div>
  );
}
