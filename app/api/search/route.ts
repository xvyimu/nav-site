import { NextRequest, NextResponse } from "next/server";
import { getApprovedLinks } from "@/lib/repositories";
import type Fuse from "fuse.js";
import type { NavLink } from "@/lib/types";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ── Fuse.js 实例缓存 ──
// 避免每次请求都重新创建 Fuse 实例和加载全量数据
// 缓存 60 秒后自动失效，平衡性能与数据新鲜度

interface FuseCache {
  fuse: Fuse<NavLink>;
  links: NavLink[];
  timestamp: number;
}

let fuseCache: FuseCache | null = null;
const CACHE_TTL_MS = 60_000; // 60 秒

async function getFuseInstance(category?: string): Promise<{ fuse: Fuse<NavLink>; links: NavLink[] }> {
  const now = Date.now();

  // 检查缓存是否有效
  if (fuseCache && now - fuseCache.timestamp < CACHE_TTL_MS) {
    let pool = fuseCache.links;
    if (category && category !== "all") {
      pool = fuseCache.links.filter((l) => l.category_slug === category);
    }
    // 为过滤后的子集创建临时 Fuse 实例（很快，因为数据已在内存中）
    const { default: FuseModule } = await import("fuse.js");
    const fuse = new FuseModule(pool, {
      keys: [
        { name: "title", weight: 2 },
        { name: "description", weight: 1 },
        { name: "category_name", weight: 0.8 },
      ],
      threshold: 0.4,
      distance: 100,
      minMatchCharLength: 1,
      includeScore: true,
    });
    return { fuse, links: pool };
  }

  // 缓存过期或不存在，重新加载
  const allLinks = await getApprovedLinks();
  const { default: FuseModule } = await import("fuse.js");

  // 缓存全量数据的 Fuse 实例
  fuseCache = {
    fuse: new FuseModule(allLinks, {
      keys: [
        { name: "title", weight: 2 },
        { name: "description", weight: 1 },
        { name: "category_name", weight: 0.8 },
      ],
      threshold: 0.4,
      distance: 100,
      minMatchCharLength: 1,
      includeScore: true,
    }),
    links: allLinks,
    timestamp: now,
  };

  // 按分类过滤
  let pool = allLinks;
  if (category && category !== "all") {
    pool = allLinks.filter((l) => l.category_slug === category);
  }

  const fuse = new FuseModule(pool, {
    keys: [
      { name: "title", weight: 2 },
      { name: "description", weight: 1 },
      { name: "category_name", weight: 0.8 },
    ],
    threshold: 0.4,
    distance: 100,
    minMatchCharLength: 1,
    includeScore: true,
  });

  return { fuse, links: pool };
}

/**
 * 服务端搜索 API
 *
 * 将 Fuse.js 模糊搜索从客户端迁移到服务端，
 * 避免在客户端 bundle 中加载全量站点数据。
 *
 * 用法：
 *   GET /api/search?q=react        — 搜索关键词
 *   GET /api/search?q=react&limit=20 — 限制返回数量
 *   GET /api/search?category=dev-tools — 按分类过滤
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
    const category = searchParams.get("category") ?? undefined;
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 20, 100) : 20;

    if (!q) {
      return NextResponse.json({
        results: [],
        total: 0,
        query: "",
      });
    }

    const { fuse } = await getFuseInstance(category);

    const raw = fuse.search(q);
    const results = raw.slice(0, limit).map((r) => ({
      id: r.item.id,
      title: r.item.title,
      url: r.item.url,
      description: r.item.description,
      icon: r.item.icon,
      category_name: r.item.category_name,
      category_slug: r.item.category_slug,
      featured: r.item.featured,
      paid: r.item.paid,
      click_count: r.item.click_count,
      score: r.score ?? 1,
    }));

    return NextResponse.json({
      results,
      total: raw.length,
      query: q,
    }, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    logger.error("Search API error", { source: "api-search" }, e instanceof Error ? e : undefined);
    return NextResponse.json(
      { error: "Search failed", results: [], total: 0 },
      { status: 500 }
    );
  }
}
