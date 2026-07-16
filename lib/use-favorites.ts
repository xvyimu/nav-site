"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";

const STORAGE_KEY = "nav-favorites";
const SYNC_RETRY_DELAY_MS = 150;

async function requestWithRetry(input: RequestInfo | URL, init: RequestInit): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (response.ok) return true;
      if (response.status !== 429 && response.status < 500) return false;
    } catch {
      // Retry one transient network failure.
    }
    if (attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, SYNC_RETRY_DELAY_MS));
    }
  }
  return false;
}

/** 收藏夹 Hook — localStorage 优先，登录后同步到服务端 */
export function useFavorites() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;

  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);
  const favoritesRef = useRef<Set<string>>(new Set());

  // 持久化：写入 localStorage
  const persist = useCallback((next: Set<string>) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // 忽略写入错误（如隐私模式）
    }
  }, []);

  const commitFavorites = useCallback((next: Set<string>) => {
    favoritesRef.current = next;
    setFavorites(next);
    persist(next);
  }, [persist]);

  // 初始化：从 localStorage 读取
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        const ids = Array.isArray(parsed)
          ? parsed.filter((value): value is string => typeof value === "string" && value.length > 0)
          : [];
        // eslint-disable-next-line react-hooks/set-state-in-effect
        commitFavorites(new Set(ids));
      }
    } catch {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    setMounted(true);
  }, [commitFavorites]);

  // 登录后：从服务端拉取收藏并合并到 localStorage
  useEffect(() => {
    if (!mounted || status !== "authenticated" || !userId) return;

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/favorites");
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled || !Array.isArray(data?.favorites)) return;

        const local = new Set(favoritesRef.current);
        const serverIds = (data.favorites as unknown[]).filter(
          (value): value is string => typeof value === "string"
        );
        const merged = new Set([...local, ...serverIds]);
        commitFavorites(merged);

        const serverSet = new Set(serverIds);
        const localOnly = [...local].filter((id) => !serverSet.has(id));
        if (localOnly.length > 0) {
          await requestWithRetry("/api/favorites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ linkIds: localOnly }),
          });
        }
      } catch {
        // Network errors keep the local source of truth intact.
      }
    })();

    return () => { cancelled = true; };
  }, [mounted, status, userId, commitFavorites]);

  const toggleFavorite = useCallback((linkId: string) => {
    const next = new Set(favoritesRef.current);
    const isAdding = !next.has(linkId);
    if (isAdding) next.add(linkId);
    else next.delete(linkId);
    commitFavorites(next);

    if (!userId) return;
    const input = isAdding
      ? "/api/favorites"
      : `/api/favorites?linkId=${encodeURIComponent(linkId)}`;
    const init: RequestInit = isAdding
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ linkIds: [linkId] }),
        }
      : { method: "DELETE" };

    void requestWithRetry(input, init).then((ok) => {
      if (ok || favoritesRef.current.has(linkId) !== isAdding) return;
      const rollback = new Set(favoritesRef.current);
      if (isAdding) rollback.delete(linkId);
      else rollback.add(linkId);
      commitFavorites(rollback);
    });
  }, [commitFavorites, userId]);

  const isFavorite = useCallback((linkId: string) => favorites.has(linkId), [favorites]);

  const clearFavorites = useCallback(() => {
    const previous = new Set(favoritesRef.current);
    commitFavorites(new Set());

    if (userId) {
      void requestWithRetry("/api/favorites?all=true", {
        method: "DELETE",
      }).then((ok) => {
        if (!ok && favoritesRef.current.size === 0) commitFavorites(previous);
      });
    }
  }, [commitFavorites, userId]);

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
