"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Loader2, Search, Sparkles, X } from "lucide-react";
import type { ResourceItem } from "@/lib/types";

// 轻量防抖 hook（字符串参数版本，规避泛型重载问题）
function useDebounce(fn: (val: string) => void, ms: number) {
  const tid = useRef<number>(0);
  useEffect(() => {
    return () => window.clearTimeout(tid.current);
  }, []);

  return useCallback(
    (val: string) => {
      window.clearTimeout(tid.current);
      tid.current = window.setTimeout(() => fn(val), ms);
    },
    [fn, ms]
  );
}

interface CategoryOption {
  value: string;
  label: string;
}

type SearchMode = "fts" | "vector" | "hybrid";

export function ResourcesClient() {
  const [query, setQuery] = useState("");
  // 默认 hybrid：vector 可用时 RRF 混排；不可用则服务端/探测回落到 fts
  const [searchMode, setSearchMode] = useState<SearchMode>("hybrid");
  const [vectorAvailable, setVectorAvailable] = useState<boolean | null>(null);
  const [activeMode, setActiveMode] = useState<SearchMode>("fts");
  const [results, setResults] = useState<ResourceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialLoad = useRef(true);
  const requestSeq = useRef(0);
  // 用 ref 避免防抖闭包拿到过期的 mode（在 effect 中同步，不在 render 写 ref）
  const searchModeRef = useRef<SearchMode>("hybrid");

  useEffect(() => {
    searchModeRef.current = searchMode;
  }, [searchMode]);

  // ── 浏览全量（空 query）→ 走自有 proxy 绕过 Edge Function 的 query-required 限制 ──
  const browse = useCallback(async () => {
    const requestId = ++requestSeq.current;
    setLoading(true);
    try {
      const res = await fetch("/api/resource-browse?limit=80");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items = (data as { results: ResourceItem[] }).results ?? [];
      if (requestId !== requestSeq.current) return;
      setResults(items);
      setTotal(items.length);
      setActiveMode("fts");
    } catch (e) {
      if (requestId !== requestSeq.current) return;
      console.error("资源库浏览失败:", e);
      setResults([]);
      setTotal(0);
    } finally {
      if (requestId === requestSeq.current) setLoading(false);
    }
  }, []);

  // ── 搜索（有 query）→ 走站内代理；mode=vector 时由服务端生成 embedding ──
  const fetchResults = useCallback(async (q: string, mode: SearchMode) => {
    const requestId = ++requestSeq.current;
    const body: Record<string, unknown> = {
      mode,
      query: q,
      limit: 50,
    };
    setLoading(true);
    try {
      const res = await fetch("/api/resource-search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items: ResourceItem[] = Array.isArray(data)
        ? data
        : (data as { results: ResourceItem[] }).results ?? [];
      const rawMode =
        data && typeof data === "object" ? (data as { mode?: string }).mode : undefined;
      const usedMode: SearchMode =
        rawMode === "hybrid" || rawMode === "vector" || rawMode === "fts" ? rawMode : "fts";
      if (requestId !== requestSeq.current) return;
      setResults(items);
      setTotal(items.length);
      setActiveMode(usedMode);
    } catch (e) {
      if (requestId !== requestSeq.current) return;
      console.error("资源库搜索失败:", e);
      setResults([]);
      setTotal(0);
    } finally {
      if (requestId === requestSeq.current) setLoading(false);
    }
  }, []);

  // 首次加载全量
  useEffect(() => {
    if (initialLoad.current) {
      initialLoad.current = false;
      browse();
    }
  }, [browse]);

  // 探测向量搜索可用性（RPC + 本地 embed 服务）
  useEffect(() => {
    let cancelled = false;
    fetch("/api/resource-search-status")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const available = data.available === true;
        setVectorAvailable(available);
        if (!available && searchModeRef.current !== "fts") {
          setSearchMode("fts");
          searchModeRef.current = "fts";
        }
      })
      .catch(() => {
        if (cancelled) return;
        setVectorAvailable(false);
        setSearchMode("fts");
        searchModeRef.current = "fts";
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 搜索防抖
  const debouncedSearch = useDebounce((q: string) => {
    fetchResults(q, searchModeRef.current);
  }, 350);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (val.trim()) {
      debouncedSearch(val);
    } else {
      browse();
    }
  };

  // 三态：fts → hybrid → vector → fts（vector 不可用时禁用切换）
  const toggleVectorMode = () => {
    if (vectorAvailable !== true) return;
    const order: SearchMode[] = ["fts", "hybrid", "vector"];
    const idx = order.indexOf(searchMode);
    const next = order[(idx + 1) % order.length];
    setSearchMode(next);
    if (query.trim()) {
      fetchResults(query.trim(), next);
    }
  };

  // ── 分类筛选 ──────────────────────────────────
  const catCounts = useCallback((): CategoryOption[] => {
    const map = new Map<string, number>();
    for (const r of results) {
      const cat = r.category || "Other";
      map.set(cat, (map.get(cat) || 0) + 1);
    }
    return [
      { value: "", label: `全部 (${total})` },
      ...Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ value: name, label: `${name} (${count})` })),
    ];
  }, [results, total]);

  const [filterCat, setFilterCat] = useState("");
  const availableCategories = new Set(results.map((r) => r.category || "Other"));
  const activeFilterCat = availableCategories.has(filterCat) ? filterCat : "";

  const filtered = activeFilterCat
    ? results.filter((r) => (r.category || "Other") === activeFilterCat)
    : results;

  // ── 快捷键 ────────────────────────────────────
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const vectorTitle =
    vectorAvailable === true
      ? searchMode === "hybrid"
        ? "混合排序（语义+关键词）· 点击切换纯语义"
        : searchMode === "vector"
          ? "纯语义搜索 · 点击切回关键词"
          : "关键词搜索 · 点击开启混合排序"
      : vectorAvailable === false
        ? "语义搜索不可用（需本地 embed 服务）"
        : "检测语义搜索可用性…";

  return (
    <div className="space-y-5">
      {/* 搜索栏 */}
      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground/30" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder={
            searchMode === "vector"
              ? "语义搜索：用自然语言描述你想找的资源…"
              : searchMode === "hybrid"
                ? "混合搜索：关键词 + 语义…"
                : "搜索资源、站点或分类…"
          }
          aria-label="搜索资源"
          className="w-full rounded-[24px] border border-input bg-background/80 py-2.5 pl-10 pr-24 text-sm text-foreground/80 placeholder:text-muted-foreground/40 outline-none backdrop-blur-sm transition-all focus:border-primary/60 focus:ring-[3px] focus:ring-primary/20"
          spellCheck={false}
        />
        <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-2">
          {vectorAvailable === null ? (
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/50 bg-muted/10">
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/30" />
            </span>
          ) : (
            <button
              type="button"
              onClick={toggleVectorMode}
              disabled={vectorAvailable !== true}
              title={vectorTitle}
              aria-label={vectorTitle}
              aria-pressed={searchMode !== "fts"}
              className={
                vectorAvailable !== true
                  ? "inline-flex h-7 w-7 cursor-not-allowed items-center justify-center rounded-full border border-border/50 bg-muted/20 text-muted-foreground/20"
                  : searchMode === "fts"
                    ? "inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/50 bg-muted/20 text-muted-foreground/60 transition-colors hover:border-primary/40 hover:text-primary"
                    : "inline-flex h-7 w-7 items-center justify-center rounded-full border border-primary/50 bg-primary/15 text-primary transition-colors hover:bg-primary/25"
              }
            >
              <Sparkles className="h-3.5 w-3.5" />
            </button>
          )}
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : query ? (
            <button
              onClick={() => {
                setQuery("");
                browse();
              }}
              className="text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
              aria-label="清除搜索"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/30">
              ⌘K
            </kbd>
          )}
        </div>
      </div>

      {/* 当前模式提示 */}
      {query && activeMode === "hybrid" && (
        <p className="text-xs text-primary/70">混合排序 · 语义 + 关键词（RRF）</p>
      )}
      {query && activeMode === "vector" && (
        <p className="text-xs text-primary/70">语义搜索 · 按相似度排序</p>
      )}

      {/* 分类筛选 */}
      <div className="flex flex-wrap gap-2">
        {catCounts().map((cat) => (
          <button
            key={cat.value}
            type="button"
            onClick={() => setFilterCat(cat.value)}
            aria-pressed={activeFilterCat === cat.value}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              activeFilterCat === cat.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* 结果 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          没有找到匹配的资源
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <Link
              key={item.id}
              href={`/resources/${item.id}`}
              className="group block rounded-xl border border-border bg-card px-3.5 py-3 card-hover"
            >
              <div className="flex min-h-[46px] items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-xs text-muted-foreground">
                  {item.domain.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                    {item.title.replace(/\r/g, "").trim()}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.domain}
                  </p>
                </div>
              </div>
              {item.summary && (
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground/70">
                  {item.summary}
                </p>
              )}
              {item.category && (
                <span className="mt-2 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                  {item.category}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
