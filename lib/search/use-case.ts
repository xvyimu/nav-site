import { logger } from "@/lib/logger";
import {
  applySearchFilters,
  buildSearchFacets,
  buildSearchSuggestions,
  buildZeroResultRecommendations,
  expandQueryTerms,
} from "@/lib/search-experience";
import { getSearchPool, searchFuseTerms, toFuseResults } from "@/lib/search/fuse";
import { decorateResults, mergeResults } from "@/lib/search/merge";
import { searchLogContext } from "@/lib/search/params";
import { getEmbedding, searchSemantic } from "@/lib/search/semantic";
import type {
  SearchParams,
  SearchResponseModel,
  SearchResult,
  SemanticFallbackReason,
} from "@/lib/search/types";

export interface ExecuteSearchInput {
  params: SearchParams;
  requestId: string;
  startedAt?: number;
}

const MIN_SEMANTIC_QUERY_LENGTH = 3;

function successHeaders(requestId: string): Record<string, string> {
  return {
    "Cache-Control": "no-store",
    "x-request-id": requestId,
  };
}

export async function executeSearch({
  params,
  requestId,
  startedAt = Date.now(),
}: ExecuteSearchInput): Promise<SearchResponseModel> {
  try {
    const { q, category, limit, semantic, filters } = params;
    const { terms, appliedSynonyms } = expandQueryTerms(q);
    const { fuse, links, allLinks } = await getSearchPool(category, filters);
    const facets = buildSearchFacets(allLinks, { ...filters, category });
    const suggestions = buildSearchSuggestions(q, allLinks, facets);

    if (!q) {
      logger.info("Search API completed", searchLogContext(requestId, params, startedAt, {
        resultCount: 0,
        responseMode: "empty",
      }));

      return {
        status: 200,
        headers: { "x-request-id": requestId },
        body: {
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
      };
    }

    const linksById = new Map(links.map((link) => [link.id, link]));
    const fuseResults = toFuseResults(searchFuseTerms(fuse, terms, limit * 2), limit * 2);
    const fuseIds = new Set(fuseResults.map((result) => result.id));

    if (semantic) {
      let semanticResults: SearchResult[] = [];
      let fallbackReason: SemanticFallbackReason = null;

      if (q.length >= MIN_SEMANTIC_QUERY_LENGTH) {
        const embedding = await getEmbedding(q);
        if (embedding) {
          semanticResults = await searchSemantic(embedding, limit, category, linksById);
          semanticResults = semanticResults.filter((result) => {
            const link = linksById.get(result.id);
            return link ? applySearchFilters([link], filters).length > 0 : false;
          });
          if (semanticResults.length === 0) fallbackReason = "semantic_empty";
        } else {
          fallbackReason = "embedding_unavailable";
        }
      } else {
        fallbackReason = "short_query";
      }

      const results = mergeResults(semanticResults, fuseResults, limit, q);
      const semanticIds = new Set(semanticResults.map((result) => result.id));
      const decoratedResults = decorateResults(results, q, terms, semanticIds, fuseIds);

      logger.info("Search API completed", searchLogContext(requestId, params, startedAt, {
        resultCount: results.length,
        fuseCandidateCount: fuseResults.length,
        semanticCandidateCount: semanticResults.length,
        responseMode: "semantic",
        fallbackReason,
      }));

      return {
        status: 200,
        headers: successHeaders(requestId),
        body: {
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
      };
    }

    const results = fuseResults.slice(0, limit);
    const decoratedResults = decorateResults(results, q, terms, new Set(), fuseIds);

    logger.info("Search API completed", searchLogContext(requestId, params, startedAt, {
      resultCount: results.length,
      fuseCandidateCount: fuseResults.length,
      responseMode: "fuse",
    }));

    return {
      status: 200,
      headers: successHeaders(requestId),
      body: {
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
    };
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

    return {
      status: 500,
      headers: { "x-request-id": requestId },
      body: { error: "Search failed", results: [], total: 0 },
    };
  }
}
