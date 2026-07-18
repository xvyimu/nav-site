"use client";

import { useEffect, useState } from "react";

/**
 * useFavicon — 域名 favicon 加载（进程内缓存 + 去重 + 并发池）
 *
 * 加载顺序：
 *   1. 调用方传入的 preferred URL（如 link.icon，已校验安全）
 *   2. /api/favicon?domain=xxx&v=2
 *   3. null → 调用方 Globe
 *
 * ResultGrid 窗口化后首屏挂载量下降；并发池限制 in-flight，
 * 并用 prefetchFavicon 在网格可见时提前预热。
 */

const faviconCache = new Map<string, string | null>();
const faviconInflight = new Map<string, Promise<string | null>>();
/** 首屏约 24 张卡；12 并发约 2 波完成，避免过多占满连接池。 */
const MAX_CONCURRENT = 12;
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
    img.decoding = "async";
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

/** 解析域名 favicon；命中内存缓存时同步返回。 */
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

/**
 * 预热可见域名的 favicon（不挂载 React 状态）。
 * ResultGrid 在切片可见时调用，减少切换分类后的首屏空白图标。
 */
export function prefetchFavicons(domains: Array<string | null | undefined>): void {
  for (const domain of domains) {
    if (!domain) continue;
    if (faviconCache.has(domain) || faviconInflight.has(domain)) continue;
    void resolveFavicon(domain);
  }
}

/**
 * @param domain 目标站点域名；传 null 时不发起网络请求
 * @param preferred 已校验的直链图标（如 nav_links.icon），优先于域名代理
 */
export function useFavicon(
  domain: string | null,
  preferred?: string | null
): string | null {
  const [faviconUrl, setFaviconUrl] = useState<string | null>(() => {
    if (preferred) return preferred;
    if (domain && faviconCache.has(domain)) {
      return faviconCache.get(domain) ?? null;
    }
    return null;
  });

  useEffect(() => {
    if (preferred) {
      // 业务库已有图标：直接展示，跳过域名代理
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFaviconUrl(preferred);
      return;
    }

    if (!domain) {
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
  }, [domain, preferred]);

  return faviconUrl;
}
