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
    <section className="nav-hero-bg relative isolate overflow-hidden px-4 pb-7 pt-20 md:px-8 md:pb-10 md:pt-24">
      <div className="nav-hero-grain" aria-hidden="true" />
      <div className="relative z-10 mx-auto flex max-w-[1480px] flex-col gap-6 py-2 md:min-h-[50svh] md:justify-between md:gap-8 md:py-6 lg:min-h-[52svh]">
        <div className="hidden items-start justify-between gap-6 md:flex">
          <div className="hidden max-w-[18rem] text-xs font-mono uppercase leading-relaxed text-[var(--paper-muted)] md:block">
            AI / Cloud / Design / Open Source
          </div>
          <div className="ml-auto flex items-center gap-2 rounded-full border border-[var(--paper-line)] bg-[var(--paper-surface)]/86 px-3 py-1.5 text-xs font-mono uppercase text-[var(--paper-muted)] shadow-[0_6px_18px_rgba(61,74,90,0.045)] backdrop-blur-sm">
            <Sparkles className="size-3.5 text-[var(--paper-accent)]" aria-hidden="true" />
            混合检索
          </div>
        </div>

        <div className="grid items-end gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.72fr)] lg:gap-8">
          <div className="flex flex-col gap-5 md:gap-7">
            <div className="flex flex-col gap-2.5 text-[var(--paper-ink)] md:gap-3">
              <p className="flex items-center gap-2 text-xs font-mono uppercase text-[var(--paper-muted)]">
                <Compass className="size-3.5" aria-hidden="true" />
                导航图谱
              </p>
              <h1 className="nav-display max-w-4xl text-[2.4rem] leading-[1.06] tracking-tight text-[var(--paper-ink)] sm:text-5xl md:text-6xl lg:text-7xl">
                寻得合用之器
                <span className="mt-1 block pl-[8%] text-[var(--paper-accent)] sm:pl-[12%]">
                  安放每一次探索。
                </span>
              </h1>
              <p className="max-w-xl text-sm leading-6 text-[var(--paper-muted)] md:max-w-2xl md:text-[0.95rem] md:leading-7">
                低噪声工具索引 · 搜索优先 · 分类收束。5 秒内找到并点开。
              </p>
            </div>

            <div className="grid max-w-5xl gap-3 md:grid-cols-[minmax(0,1fr)_220px] md:gap-4">
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
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[var(--paper-line)] bg-[var(--paper-surface)] px-5 text-sm font-medium text-[var(--paper-ink)] shadow-[0_8px_24px_rgba(61,74,90,0.055)] transition hover:border-[var(--paper-accent)] hover:text-[var(--paper-accent)] focus-visible:outline-[var(--paper-accent)] md:min-h-14"
              >
                探索图谱
                <ArrowDown className="size-4" aria-hidden="true" />
              </a>
            </div>
          </div>

          <aside className="nav-glass flex flex-col gap-3 p-3 text-[var(--paper-ink)] md:gap-5 md:p-5" aria-label="图谱概览">
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              <Metric value={totalLinks} label="工具" />
              <Metric value={categoryCount} label="分组" />
              <Metric value={featuredCount} label="精选" />
            </div>
            <p className="text-xs leading-5 text-[var(--paper-muted)] md:text-sm md:leading-6">
              无需扫视喧嚣链接墙，安静地寻得可用工具。
            </p>
            <div className="hidden flex-wrap gap-2 sm:flex">
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
            <div className="hidden items-center justify-between border-t border-[var(--paper-line)] pt-4 text-xs font-mono uppercase text-[var(--paper-faint)] md:flex">
              <span>Cmd / Ctrl + K</span>
              <Search className="size-3.5" aria-hidden="true" />
            </div>
          </aside>
        </div>

        <div className="hidden gap-4 text-xs font-mono uppercase leading-relaxed text-[var(--paper-muted)] md:grid md:grid-cols-[180px_minmax(0,1fr)_260px]">
          <div className="rounded-xl border border-[var(--paper-line)] bg-[var(--paper-surface)]/70 p-3 backdrop-blur">
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
    <div className="rounded-xl border border-[var(--paper-line)] bg-[var(--paper-surface)] p-2.5 md:p-3">
      <div className="text-xl font-semibold tabular-nums text-[var(--paper-ink)] md:text-2xl">{value}</div>
      <div className="text-[11px] font-mono uppercase text-[var(--paper-faint)] md:text-xs">{label}</div>
    </div>
  );
}
