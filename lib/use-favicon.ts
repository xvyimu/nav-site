"use client";

import { useEffect, useState } from "react";

/**
 * useFavicon — 域名 favicon 加载（兜底链 + 进程内去重 + 并发池）
 *
 * 加载顺序：
 *   1. /api/favicon?domain=xxx&v=2
 *   2. null → 调用方 Globe
 *
 * ResultGrid 窗口化后首屏挂载量下降；此处再限制同时 in-flight ≤ 6。
 */

const faviconCache = new Map<string, string | null>();
const faviconInflight = new Map<string, Promise<string | null>>();
const MAX_CONCURRENT = 6;
let activeLoads = 0;
const waitQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeLoads < MAX_CONCURRENT) {
    activeLoads += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waitQueue.push(() => {
      activeLoads += 1;
      resolve();
    });
  });
}

function releaseSlot(): void {
  activeLoads = Math.max(0, activeLoads - 1);
  const next = waitQueue.shift();
  if (next) next();
}

function loadImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

async function resolveFavicon(domain: string): Promise<string | null> {
  if (faviconCache.has(domain)) {
    return faviconCache.get(domain) ?? null;
  }

  const existing = faviconInflight.get(domain);
  if (existing) return existing;

  const task = (async () => {
    await acquireSlot();
    try {
      const proxyUrl = `/api/favicon?domain=${encodeURIComponent(domain)}&v=2`;
      if (await loadImage(proxyUrl)) {
        faviconCache.set(domain, proxyUrl);
        return proxyUrl;
      }

      faviconCache.set(domain, null);
      return null;
    } finally {
      releaseSlot();
    }
  })().finally(() => {
    faviconInflight.delete(domain);
  });

  faviconInflight.set(domain, task);
  return task;
}

export function useFavicon(domain: string | null): string | null {
  const [faviconUrl, setFaviconUrl] = useState<string | null>(() =>
    domain && faviconCache.has(domain) ? (faviconCache.get(domain) ?? null) : null
  );

  useEffect(() => {
    if (!domain) {
      // 同步 cache 读路径：domain 清空时重置展示
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFaviconUrl(null);
      return;
    }

    if (faviconCache.has(domain)) {
      setFaviconUrl(faviconCache.get(domain) ?? null);
      return;
    }

    let cancelled = false;
    resolveFavicon(domain).then((url) => {
      if (!cancelled) setFaviconUrl(url);
    });

    return () => {
      cancelled = true;
    };
  }, [domain]);

  return faviconUrl;
}
