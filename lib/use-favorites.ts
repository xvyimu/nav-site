"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";

const STORAGE_KEY = "nav-favorites";

/** 收藏夹 Hook — localStorage 优先，登录后同步到服务端 */
export function useFavorites() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;

  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  // 持久化：写入 localStorage
  const persist = useCallback((next: Set<string>) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // 忽略写入错误（如隐私模式）
    }
  }, []);

  // 初始化：从 localStorage 读取
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const ids = JSON.parse(raw) as string[];
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFavorites(new Set(ids));
      }
    } catch {
      // 忽略解析错误
    }
    setMounted(true);
  }, []);

  // 登录后：从服务端拉取收藏并合并到 localStorage
  useEffect(() => {
    if (status !== "authenticated" || !userId) return;

    let cancelled = false;
    fetch("/api/favorites")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.favorites) return;
        const serverIds = data.favorites as string[];
        setFavorites((prev) => {
          const merged = new Set(prev);
          for (const id of serverIds) {
            merged.add(id);
          }
          persist(merged);
          return merged;
        });
      })
      .catch(() => {
        // 网络错误时仅使用本地数据
      });

    return () => { cancelled = true; };
  }, [status, userId, persist]);

  const toggleFavorite = useCallback((linkId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      const isAdding = !next.has(linkId);
      if (isAdding) {
        next.add(linkId);
      } else {
        next.delete(linkId);
      }
      persist(next);

      // 登录时同步到服务端（fire-and-forget）
      if (userId) {
        if (isAdding) {
          fetch("/api/favorites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ linkIds: [linkId] }),
          }).catch(() => {});
        } else {
          fetch(`/api/favorites?linkId=${encodeURIComponent(linkId)}`, {
            method: "DELETE",
          }).catch(() => {});
        }
      }

      return next;
    });
  }, [persist, userId]);

  const isFavorite = useCallback((linkId: string) => favorites.has(linkId), [favorites]);

  const clearFavorites = useCallback(() => {
    setFavorites(new Set());
    persist(new Set());

    // 登录时清空服务端收藏
    if (userId) {
      fetch("/api/favorites?all=true", {
        method: "DELETE",
      }).catch(() => {});
    }
  }, [persist, userId]);

  return useMemo(() => ({
    favorites,
    favoriteIds: mounted ? [...favorites] : [],
    toggleFavorite,
    isFavorite,
    clearFavorites,
    count: favorites.size,
    mounted,
    isAuthenticated: status === "authenticated",
  }), [favorites, mounted, toggleFavorite, isFavorite, clearFavorites, status]);
}
