"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Heart, Trash2, ArrowLeft, Loader2 } from "lucide-react";
import type { NavLink } from "@/lib/types";
import { LinkCard } from "@/components/LinkCard";
import {
  useFavoritesActions,
  useFavoritesState,
} from "@/components/FavoritesProvider";

function isNavLink(value: unknown): value is NavLink {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.title === "string" && typeof row.url === "string";
}

export function FavoritesView() {
  const { favorites, count } = useFavoritesState();
  const { clearFavorites } = useFavoritesActions();
  const [links, setLinks] = useState<NavLink[]>([]);
  const [loading, setLoading] = useState(count > 0);

  useEffect(() => {
    if (count === 0) {
      setLinks([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void fetch("/api/favorites?detail=links")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data?.links) ? data.links.filter(isNavLink) : [];
        // Keep only ids still present in local favorite set (optimistic UI).
        const allowed = new Set(favorites);
        setLinks(rows.filter((link: NavLink) => allowed.has(link.id)));
      })
      .catch(() => {
        if (!cancelled) setLinks([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [count, favorites]);

  const sorted = useMemo(
    () => [...links].sort((a, b) => a.title.localeCompare(b.title, "zh-CN")),
    [links],
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            aria-label="返回首页"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </Link>
          <Heart className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">我的收藏</h1>
          <span className="text-sm text-muted-foreground">({count})</span>
        </div>
        {count > 0 && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("确定清空全部收藏？")) clearFavorites();
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            清空
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          加载中…
        </div>
      ) : count === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
          还没有收藏，去首页点亮心形吧。
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((link, index) => (
            <LinkCard key={link.id} link={link} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}
