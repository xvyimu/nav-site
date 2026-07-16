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

export interface SearchAdapters {
  getSearchPool: typeof getSearchPool;
  getEmbedding: typeof getEmbedding;
  searchSemantic: typeof searchSemantic;
  logger: Pick<typeof logger, "info" | "warn" | "error" | "debug">;
  now: () => number;
}

export interface ExecuteSearchInput {
  params: SearchParams;
  requestId: string;
  startedAt?: number;
  adapters?: SearchAdapters;
}

const MIN_SEMANTIC_QUERY_LENGTH = 3;

export const defaultSearchAdapters: SearchAdapters = {
  getSearchPool,
  getEmbedding,
  searchSemantic,
  logger,
  now: () => Date.now(),
};

function successHeaders(requestId: string): Record<string, string> {
  return {
    "Cache-Control": "no-store",
    "x-request-id": requestId,
  };
}

export async function executeSearch({
  params,
  requestId,
  startedAt,
  adapters = defaultSearchAdapters,
}: ExecuteSearchInput): Promise<SearchResponseModel> {
  const searchStartedAt = startedAt ?? adapters.now();

  try {
    const { q, category, limit, semantic, filters } = params;
    const { terms, appliedSynonyms } = expandQueryTerms(q);
    const shouldEmbed = semantic && q.length >= MIN_SEMANTIC_QUERY_LENGTH;
    const [{ fuse, links, allLinks }, prefetchedEmbedding] = await Promise.all([
      adapters.getSearchPool(category, filters),
      shouldEmbed ? adapters.getEmbedding(q) : Promise.resolve(null),
    ]);
    const facets = buildSearchFacets(allLinks, { ...filters, category });
    const suggestions = buildSearchSuggestions(q, allLinks, facets);

    if (!q) {
      adapters.logger.info("Search API completed", searchLogContext(requestId, params, searchStartedAt, {
        resultCount: 0,
        responseMode: "empty",
      }));

      return {
        status: 200,
        headers: successHeaders(requestId),
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
        const embedding = prefetchedEmbedding;
        if (embedding) {
          semanticResults = await adapters.searchSemantic(embedding, limit, category, linksById);
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

      adapters.logger.info("Search API completed", searchLogContext(requestId, params, searchStartedAt, {
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

    adapters.logger.info("Search API completed", searchLogContext(requestId, params, searchStartedAt, {
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
    adapters.logger.error(
      "Search API error",
      {
        source: "api-search",
        event: "search_request_failed",
        requestId,
        durationMs: adapters.now() - searchStartedAt,
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
