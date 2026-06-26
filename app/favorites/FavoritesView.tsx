"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Heart, Trash2, ArrowLeft, Loader2 } from "lucide-react";
import type { NavLink } from "@/lib/types";
import { LinkCard } from "@/components/LinkCard";
import { useFavoritesContext } from "@/components/FavoritesProvider";

export function FavoritesView() {
  const { favorites, clearFavorites, count } = useFavoritesContext();
  const [links, setLinks] = useState<NavLink[]>([]);
  const [loading, setLoading] = useState(count > 0);

  // 按收藏 ID 批量获取链接数据
  useEffect(() => {
    if (count === 0) return;

    setLoading(true);
    const ids = [...favorites].join(",");
    fetch(`/api/tools?ids=${encodeURIComponent(ids)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.tools) setLinks(data.tools as NavLink[]);
      })
      .catch(() => {
        // 网络错误时显示空列表
      })
      .finally(() => setLoading(false));
  }, [favorites, count]);

  // 使用 Set 进行 O(1) 查找
  const sorted = useMemo(
    () => [...links].sort((a, b) => a.title.localeCompare(b.title, "zh-CN")),
    [links],
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
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
          <h1 className="text-xl font-bold text-foreground">
            我的收藏
            <span className="ml-2 text-sm font-normal text-muted-foreground">({count})</span>
          </h1>
        </div>
        {count > 0 && (
          <button
            onClick={clearFavorites}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-red-300 hover:text-red-500"
            aria-label="清空收藏"
          >
            <Trash2 className="h-4 w-4" />
            清空
          </button>
        )}
      </div>

      {/* 内容 */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          加载中…
        </div>
      ) : sorted.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {sorted.map((link, i) => (
            <LinkCard key={link.id} link={link} index={i} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Heart className="mb-4 h-12 w-12 text-muted-foreground/30" />
          <p className="text-sm">还没有收藏任何站点</p>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            去首页发现工具
          </Link>
        </div>
      )}
    </div>
  );
}