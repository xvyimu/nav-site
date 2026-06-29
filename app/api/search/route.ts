import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import {
  applySearchFilters,
  buildSearchFacets,
  buildSearchSuggestions,
  buildZeroResultRecommendations,
  expandQueryTerms,
} from "@/lib/search-experience";
import {
  getRequestId,
  parseSearchParams,
  searchLogContext,
} from "@/lib/search/params";
import { getSearchPool, searchFuseTerms, toFuseResults } from "@/lib/search/fuse";
import { getEmbedding, searchSemantic } from "@/lib/search/semantic";
import { decorateResults, mergeResults } from "@/lib/search/merge";
import type { SearchResult } from "@/lib/search/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIN_SEMANTIC_QUERY_LENGTH = 3;

/**
 * 服务端搜索 API
 *
 * 用法：
 *   GET /api/search?q=react
 *   GET /api/search?q=react&limit=20
 *   GET /api/search?q=react&category=dev-tools
 *   GET /api/search?q=react&semantic=true
 *
 * 路由层只做：参数解析 → 调度 fuse/semantic → 装饰 → 响应。
 * 具体逻辑分布在 lib/search/{params,fuse,semantic,merge}.ts。
 */
export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const startedAt = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const parsed = parseSearchParams(searchParams, requestId);
    if (parsed instanceof NextResponse) return parsed;

    const { q, category, limit, semantic, filters } = parsed;
    const { terms, appliedSynonyms } = expandQueryTerms(q);
    const { fuse, links, allLinks } = await getSearchPool(category, filters);
    const facets = buildSearchFacets(allLinks, { ...filters, category });
    const suggestions = buildSearchSuggestions(q, allLinks, facets);

    if (!q) {
      logger.info("Search API completed", searchLogContext(requestId, parsed, startedAt, {
        resultCount: 0,
        responseMode: "empty",
      }));
      return NextResponse.json(
        {
          results: [],
          total: 0,
          query: "",
          mode: semantic ? "semantic" : "fuse",
          facets,
          suggestions,
          recommendations: buildZeroResultRecommendations(links, 6),
          expandedTerms: [],
          appliedSynonyms: [],
        },
        {
          headers: {
            "x-request-id": requestId,
          },
        }
      );
    }

    const linksById = new Map(links.map((link) => [link.id, link]));
    const fuseResults = toFuseResults(searchFuseTerms(fuse, terms, limit * 2), limit * 2);
    const fuseIds = new Set(fuseResults.map((result) => result.id));

    if (semantic) {
      // ── 语义搜索模式 ──
      // 始终计算 Fuse 结果并参与混排：
      // 如果纯语义结果已满但质量差，强关键词结果仍必须能排到前面。
      let semanticResults: SearchResult[] = [];
      let fallbackReason: "short_query" | "embedding_unavailable" | "semantic_empty" | null = null;
      if (q.length >= MIN_SEMANTIC_QUERY_LENGTH) {
        const embedding = await getEmbedding(q);
        if (embedding) {
          semanticResults = await searchSemantic(embedding, limit, category, linksById);
          semanticResults = semanticResults.filter((result) => {
            const link = linksById.get(result.id);
            return link ? applySearchFilters([link], filters).length > 0 : true;
          });
          if (semanticResults.length === 0) {
            fallbackReason = "semantic_empty";
          }
        } else {
          fallbackReason = "embedding_unavailable";
        }
      } else {
        fallbackReason = "short_query";
      }
      const results = mergeResults(semanticResults, fuseResults, limit, q);
      const semanticIds = new Set(semanticResults.map((result) => result.id));
      const decoratedResults = decorateResults(results, q, terms, semanticIds, fuseIds);
      logger.info("Search API completed", searchLogContext(requestId, parsed, startedAt, {
        resultCount: results.length,
        fuseCandidateCount: fuseResults.length,
        semanticCandidateCount: semanticResults.length,
        responseMode: "semantic",
        fallbackReason,
      }));

      return NextResponse.json(
        {
          results: decoratedResults,
          total: decoratedResults.length,
          query: q,
          mode: "semantic",
          facets,
          suggestions,
          recommendations: decoratedResults.length === 0 ? buildZeroResultRecommendations(links, 6) : [],
          expandedTerms: terms,
          appliedSynonyms,
          fallbackReason,
        },
        {
          headers: {
            "Cache-Control": "no-store",
            "x-request-id": requestId,
          },
        }
      );
    }

    // ── 传统 Fuse.js 模糊搜索模式 ──
    const results = fuseResults.slice(0, limit);
    const decoratedResults = decorateResults(results, q, terms, new Set(), fuseIds);
    logger.info("Search API completed", searchLogContext(requestId, parsed, startedAt, {
      resultCount: results.length,
      fuseCandidateCount: fuseResults.length,
      responseMode: "fuse",
    }));

    return NextResponse.json(
      {
        results: decoratedResults,
        total: fuseResults.length,
        query: q,
        mode: "fuse",
        facets,
        suggestions,
        recommendations: decoratedResults.length === 0 ? buildZeroResultRecommendations(links, 6) : [],
        expandedTerms: terms,
        appliedSynonyms,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "x-request-id": requestId,
        },
      }
    );
  } catch (e) {
    logger.error(
      "Search API error",
      {
        source: "api-search",
        event: "search_request_failed",
        requestId,
        durationMs: Date.now() - startedAt,
      },
      e instanceof Error ? e : undefined
    );

    return NextResponse.json(
      { error: "Search failed", results: [], total: 0 },
      { status: 500, headers: { "x-request-id": requestId } }
    );
  }
}
