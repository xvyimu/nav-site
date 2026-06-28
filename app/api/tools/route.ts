import { NextRequest, NextResponse } from "next/server";
import { getApprovedLinksForApi, getCategories } from "@/lib/repositories";
import { slugify } from "@/lib/slugify";
import { logger } from "@/lib/logger";
import { withTimeout } from "@/lib/utils";

export const dynamic = "force-dynamic";

const FETCH_TIMEOUT = 8000;

/**
 * Agent API 端点 — 为 AI Agent 和第三方应用提供结构化工具数据
 *
 * 用法：
 *   GET /api/tools              — 获取所有工具
 *   GET /api/tools?category=xxx — 按分类过滤
 *   GET /api/tools?format=json  — JSON 格式（默认）
 *   GET /api/tools?limit=10     — 限制返回数量
 *   GET /api/tools?search=chat  — 关键词搜索
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") ?? undefined;
    const limitParam = searchParams.get("limit");
    const search = searchParams.get("search")?.toLowerCase();
    const idsParam = searchParams.get("ids");
    const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;

    const [links, categories] = await Promise.all([
      withTimeout(getApprovedLinksForApi(category), FETCH_TIMEOUT).catch(() => {
        logger.warn("API: getApprovedLinksForApi timed out");
        return [];
      }),
      withTimeout(getCategories(), FETCH_TIMEOUT).catch(() => []),
    ]);

    let result = links;

    // 关键词搜索
    if (search) {
      result = result.filter(
        (l) =>
          l.title.toLowerCase().includes(search) ||
          l.description?.toLowerCase().includes(search) ||
          l.category_name?.toLowerCase().includes(search)
      );
    }

    // 按 ID 批量查询（收藏页使用）
    if (ids && ids.length > 0) {
      const idSet = new Set(ids);
      result = result.filter((l) => idSet.has(l.id));
    }

    // 数量限制（上限 100，防止滥用）
    if (limitParam) {
      const limit = parseInt(limitParam, 10);
      if (!isNaN(limit) && limit > 0) {
        result = result.slice(0, Math.min(limit, 100));
      }
    }

    // 构建分类映射
    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    // 格式化为 Agent 友好的结构化数据
    const tools = result.map((link) => {
      const category = link.category_id ? categoryMap.get(link.category_id) : null;
      return {
        id: link.id,
        name: link.title,
        slug: slugify(link.title),
        url: link.url,
        description: link.description || "",
        icon: link.icon || "",
        category: category
          ? {
              id: category.id,
              name: category.name,
              slug: category.slug,
            }
          : null,
        tags: [link.featured ? "featured" : null, link.paid ? "paid" : null].filter(
          Boolean
        ) as string[],
        click_count: link.click_count,
        detail_page: `/tool/${slugify(link.title)}`,
      };
    });

    return NextResponse.json(
      {
        total: tools.length,
        category: category || "all",
        tools,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (e) {
    logger.error("Agent API error", { source: "api-tools" }, e instanceof Error ? e : undefined);
    return NextResponse.json(
      { error: "Failed to fetch tools" },
      { status: 500 }
    );
  }
}
