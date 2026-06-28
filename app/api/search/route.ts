  import { NextRequest, NextResponse } from "next/server";
  import { getApprovedLinks } from "@/lib/repositories";
  import { createServiceRoleClient } from "@/lib/supabase/server";
  import type Fuse from "fuse.js";
  import type { NavLink, SearchSource } from "@/lib/types";
  import { logger } from "@/lib/logger";
  import { withTimeout } from "@/lib/utils";
  import { createHash, randomUUID } from "node:crypto";
  import {
    applySearchFilters,
    buildSearchFacets,
    buildSearchMeta,
    buildSearchSuggestions,
    buildZeroResultRecommendations,
    expandQueryTerms,
    normalizeSearchFilters,
    type PopularityFilter,
    type SearchFilters,
  } from "@/lib/search-experience";

  export const dynamic = "force-dynamic";
  export const runtime = "nodejs";

  const FETCH_TIMEOUT = 8000;
  const DEFAULT_EMBED_SERVER_URL = "http://127.0.0.1:8003";
  const MAX_QUERY_LENGTH = 120;
  const MAX_LIMIT = 100;
  const MIN_SEMANTIC_QUERY_LENGTH = 3;
  const MIN_SEMANTIC_SIMILARITY = 0.35;
  const CATEGORY_SLUG_RE = /^[a-z0-9-]{1,50}$/;
  const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

  function normalizeHostname(hostname: string): string {
    return hostname.replace(/^\[(.*)\]$/, "$1").toLowerCase();
  }

  // ── 结果类型 ──

  interface SearchResult {
    id: string;
    title: string;
    url: string;
    description: string | null;
    icon: string | null;
    category_name: string | undefined;
    category_slug: string | undefined;
    featured: boolean;
    paid: boolean;
    click_count: number;
    /** Fuse.js score: 0 = perfect, 1 = no match */
    score?: number;
    /** pgvector similarity: 1 = perfect, 0 = no match */
    similarity?: number;
    /** Result source */
    source: "fuse" | "semantic";
    tags?: NavLink["tags"];
    review_count?: number;
    avg_rating?: number;
    searchMeta?: NavLink["searchMeta"];
  }

  interface SearchParams {
    q: string;
    category?: string;
    limit: number;
    semantic: boolean;
    filters: SearchFilters;
  }

  function badRequest(message: string, requestId?: string): NextResponse {
    return NextResponse.json(
      { error: message, results: [], total: 0 },
      {
        status: 400,
        headers: requestId ? { "x-request-id": requestId } : undefined,
      }
    );
  }

  function getRequestId(request: NextRequest): string {
    return request.headers.get("x-request-id") || randomUUID();
  }

  function hashQuery(q: string): string {
    return createHash("sha256").update(q).digest("hex").slice(0, 12);
  }

  function searchLogContext(
    requestId: string,
    params: Pick<SearchParams, "q" | "category" | "limit" | "semantic">,
    startedAt: number,
    extra?: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      source: "api-search",
      event: "search_request",
      requestId,
      queryLength: params.q.length,
      queryHash: params.q ? hashQuery(params.q) : null,
      category: params.category ?? "all",
      limit: params.limit,
      requestedMode: params.semantic ? "semantic" : "fuse",
      durationMs: Date.now() - startedAt,
      ...extra,
    };
  }

  function parseSearchParams(searchParams: URLSearchParams, requestId?: string): SearchParams | NextResponse {
    const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
    if (q.length > MAX_QUERY_LENGTH) {
      return badRequest(`q must be ${MAX_QUERY_LENGTH} characters or fewer`, requestId);
    }

    const category = searchParams.get("category") ?? undefined;
    if (category && category !== "all" && !CATEGORY_SLUG_RE.test(category)) {
      return badRequest("category must be a valid slug", requestId);
    }

    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      return badRequest(`limit must be an integer from 1 to ${MAX_LIMIT}`, requestId);
    }

    const tagSlugs = searchParams
      .getAll("tag")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean);
    if (tagSlugs.some((tag) => !CATEGORY_SLUG_RE.test(tag))) {
      return badRequest("tag must be a valid slug", requestId);
    }

    const minRatingParam = searchParams.get("minRating");
    const minRating = minRatingParam ? Number(minRatingParam) : null;
    if (minRating !== null && (!Number.isFinite(minRating) || minRating < 1 || minRating > 5)) {
      return badRequest("minRating must be a number from 1 to 5", requestId);
    }

    const popularityParam = searchParams.get("popularity");
    const popularity =
      popularityParam === "featured" || popularityParam === "popular"
        ? popularityParam
        : null;
    if (popularityParam && !popularity) {
      return badRequest("popularity must be featured or popular", requestId);
    }

    return {
      q,
      category,
      limit,
      semantic: searchParams.get("semantic") === "true",
      filters: normalizeSearchFilters({
        category,
        tagSlugs,
        minRating,
        popularity: popularity as PopularityFilter | null,
      }),
    };
  }

  function getEmbedEndpoint(): string | null {
    const raw = process.env.EMBED_SERVER_URL ?? DEFAULT_EMBED_SERVER_URL;

    try {
      const url = new URL(raw);
      if (
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        !LOOPBACK_HOSTS.has(normalizeHostname(url.hostname))
      ) {
        logger.warn("Ignoring non-loopback EMBED_SERVER_URL", { source: "api-search" });
        return null;
      }
      return new URL("/embed-query", url).toString();
    } catch {
      logger.warn("Ignoring invalid EMBED_SERVER_URL", { source: "api-search" });
      return null;
    }
  }

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

  function createFuse(FuseModule: typeof Fuse, links: NavLink[]): Fuse<NavLink> {
    return new FuseModule(links, {
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
  }

  async function getSearchPool(
    category?: string,
    filters?: SearchFilters,
  ): Promise<{ fuse: Fuse<NavLink>; links: NavLink[]; allLinks: NavLink[] }> {
    const now = Date.now();
    const { default: FuseModule } = await import("fuse.js");
    let allLinks: NavLink[];

    // 检查缓存是否有效
    if (fuseCache && now - fuseCache.timestamp < CACHE_TTL_MS) {
      allLinks = fuseCache.links;
    } else {
      allLinks = await withTimeout(getApprovedLinks(), FETCH_TIMEOUT).catch(() => {
        logger.warn("Search API: getApprovedLinks timed out");
        return [];
      });

      fuseCache = {
        fuse: createFuse(FuseModule, allLinks),
        links: allLinks,
        timestamp: now,
      };
    }

    let pool = allLinks;
    if (category && category !== "all") {
      pool = allLinks.filter((l) => l.category_slug === category);
    }
    pool = applySearchFilters(pool, filters);

    return {
      fuse: createFuse(FuseModule, pool),
      links: pool,
      allLinks,
    };
  }

  // ── 嵌入微服务客户端 ──

  /**
   * 调用本地嵌入微服务生成向量
   *
   * @param text - 需要向量化的文本
   * @returns 512 维归一化向量数组，失败时返回 null
   */
  async function getEmbedding(text: string): Promise<number[] | null> {
    const endpoint = getEmbedEndpoint();
    if (!endpoint) return null;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        logger.warn("Embed server error", { status: res.status, source: "api-search" });
        return null;
      }

      const data = await res.json();
      if (!Array.isArray(data.embedding) || data.embedding.length === 0) {
        logger.warn("Embed server returned invalid payload", { source: "api-search" });
        return null;
      }

      return data.embedding as number[];
    } catch (e) {
      logger.warn("Embed server request failed", {
        source: "api-search",
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  /**
   * 传入 512 维向量，调用 pgvector 语义搜索
   *
   * 使用 service_role 客户端调用 search_links_semantic RPC，
   * 该函数需要 SELECT 权限遍历 nav_links 表。
   */
  interface SemanticRow {
    id: string;
    title: string;
    url: string;
    description: string | null;
    icon: string | null;
    category_name: string | null;
    category_slug: string | null;
    similarity: number;
    featured: boolean;
    paid: boolean;
    click_count: number;
  }

  async function searchSemantic(
    embedding: number[],
    limit: number,
    category?: string,
    linksById?: Map<string, NavLink>,
  ): Promise<SearchResult[]> {
    try {
      const supabase = createServiceRoleClient();
      const matchCount = category && category !== "all" ? limit * 3 : limit;

      const { data, error } = await supabase.rpc("search_links_semantic", {
        query_embedding: embedding,
        match_count: matchCount,
      });

      if (error) {
        logger.error("Semantic search RPC failed", { source: "api-search" }, error);
        return [];
      }

      let rows = data as unknown as SemanticRow[];

      rows = rows
        .filter((r) => !category || category === "all" || r.category_slug === category)
        .slice(0, limit);

      // Apply lightweight business signal boost:
      // featured/paid links get similarity nudged up by 0.05 (within [0,1] range).
      // click_count > 5 gets +0.02. This is applied post-query, so it doesn't
      // affect the initial pgvector ranking but boosts business-critical links
      // when they are already in the candidate set.
      rows = rows.map((r) => ({
        ...r,
        similarity: Math.min(
          1.0,
          r.similarity +
            (r.featured || r.paid ? 0.05 : 0) +
            (r.click_count > 5 ? 0.02 : 0)
        ),
      }));

      return rows
        .filter((r) => r.similarity >= MIN_SEMANTIC_SIMILARITY)
        .map((r) => {
          const link = linksById?.get(r.id);

          return {
            id: r.id,
            title: r.title,
            url: r.url,
            description: r.description ?? "",
            icon: r.icon,
            category_name: r.category_name ?? undefined,
            category_slug: r.category_slug ?? undefined,
            featured: link?.featured ?? false,
            paid: link?.paid ?? false,
            click_count: link?.click_count ?? 0,
            tags: link?.tags,
            review_count: link?.review_count,
            avg_rating: link?.avg_rating,
            similarity: r.similarity,
            source: "semantic" as const,
          };
        });
    } catch (e) {
      logger.error("Semantic search failed", { source: "api-search" }, e instanceof Error ? e : undefined);
      return [];
    }
  }

  type FuseResultItem = {
    item: NavLink;
    score?: number;
  };

  function searchFuseTerms(fuse: Fuse<NavLink>, terms: string[], limit: number): FuseResultItem[] {
    const byId = new Map<string, FuseResultItem>();
    const queryTerms = terms.length > 0 ? terms : [""];

    for (const term of queryTerms) {
      if (!term) continue;
      for (const result of fuse.search(term).slice(0, limit)) {
        const existing = byId.get(result.item.id);
        if (!existing || (result.score ?? 1) < (existing.score ?? 1)) {
          byId.set(result.item.id, result);
        }
      }
    }

    return Array.from(byId.values())
      .sort((a, b) => (a.score ?? 1) - (b.score ?? 1))
      .slice(0, limit);
  }

  function toFuseResults(raw: FuseResultItem[], limit: number): SearchResult[] {
    return raw.slice(0, limit).map((r) => ({
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
      tags: r.item.tags,
      review_count: r.item.review_count,
      avg_rating: r.item.avg_rating,
      score: r.score ?? 1,
      source: "fuse" as const,
    }));
  }

  function toNavLinkResult(result: SearchResult): NavLink {
    return {
      id: result.id,
      title: result.title,
      url: result.url,
      description: result.description,
      icon: result.icon,
      category_id: null,
      approved: true,
      paid: result.paid,
      featured: result.featured,
      click_count: result.click_count,
      created_at: "",
      category_name: result.category_name,
      category_slug: result.category_slug,
      tags: result.tags,
      review_count: result.review_count,
      avg_rating: result.avg_rating,
      score: result.score,
      similarity: result.similarity,
      searchMeta: result.searchMeta,
    };
  }

  function decorateResults(
    results: SearchResult[],
    query: string,
    terms: string[],
    semanticIds = new Set<string>(),
    fuseIds = new Set<string>(),
  ): NavLink[] {
    return results.map((result) => {
      const source: SearchSource =
        semanticIds.has(result.id) && fuseIds.has(result.id)
          ? "hybrid"
          : result.source;
      return toNavLinkResult({
        ...result,
        searchMeta: buildSearchMeta({
          link: toNavLinkResult(result),
          query,
          terms,
          source,
          score: result.score,
          similarity: result.similarity,
        }),
      });
    });
  }

  /**
   * Hybrid merge using Reciprocal Rank Fusion (RRF).
   *
   * RRF combines ranked lists from different sources into a single scored list.
   * Each item gets score = sum(1 / (k + rank_in_source)) across all sources.
   * k = 60 is the standard RRF constant from the Cormack et al. paper.
   *
   * This replaces the old bucket-based merge that put all "strong keyword" hits
   * ahead of all semantic results, regardless of actual relevance.
   */
  function keywordBoost(result: SearchResult, query: string): number {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return 0;

    const title = result.title.toLowerCase();
    const description = (result.description ?? "").toLowerCase();
    const categoryName = (result.category_name ?? "").toLowerCase();
    const categorySlug = (result.category_slug ?? "").toLowerCase();

    if (title === normalizedQuery) return 0.003;
    if (title.includes(normalizedQuery)) return 0.002;
    if (description.includes(normalizedQuery)) return 0.001;
    if (categoryName.includes(normalizedQuery) || categorySlug.includes(normalizedQuery)) return 0.0005;
    return 0;
  }

  function qualityBoost(result: SearchResult, query: string): number {
    const fuseBoost = result.score === undefined ? 0 : Math.max(0, 1 - result.score) * 0.001;
    const semanticBoost =
      result.similarity === undefined ? 0 : Math.max(0, result.similarity - MIN_SEMANTIC_SIMILARITY) * 0.001;
    return keywordBoost(result, query) + fuseBoost + semanticBoost;
  }

  function mergeResults(
    semantic: SearchResult[],
    fuse: SearchResult[],
    limit: number,
    query: string,
  ): SearchResult[] {
    if (semantic.length === 0 && fuse.length === 0) return [];
    if (semantic.length === 0) return fuse.slice(0, limit);
    if (fuse.length === 0) return semantic.slice(0, limit);

    const K = 60;
    const scores = new Map<string, { result: SearchResult; score: number }>();

    const addRank = (results: SearchResult[]) => {
      for (let rank = 0; rank < results.length; rank++) {
        const r = results[rank];
        const existing = scores.get(r.id);
        const score = 1 / (K + rank + 1);
        if (existing) {
          existing.score += score + qualityBoost(r, query);
        } else {
          scores.set(r.id, { result: r, score: score + qualityBoost(r, query) });
        }
      }
    };

    addRank(semantic);
    addRank(fuse);

    const sorted = Array.from(scores.values())
      .sort((a, b) => b.score - a.score)
      .map((s) => s.result);

    return sorted.slice(0, limit);
  }

  /**
   * 服务端搜索 API
   *
   * 用法：
   *   GET /api/search?q=react
   *   GET /api/search?q=react&limit=20
   *   GET /api/search?q=react&category=dev-tools
   *   GET /api/search?q=react&semantic=true
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
