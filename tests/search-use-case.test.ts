import Fuse from "fuse.js";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { applySearchFilters, type SearchFilters } from "@/lib/search-experience";
import { executeSearch, type SearchAdapters } from "@/lib/search/use-case";
import type {
  SearchApiBody,
  SearchParams,
  SearchResult,
  SearchSuccessBody,
} from "@/lib/search/types";
import type { NavLink } from "@/lib/types";

const sampleLinks: NavLink[] = [
  {
    id: "550e8400-e29b-41d4-a716-446655440000",
    title: "OpenAI Platform",
    url: "https://platform.openai.com",
    description: "AI developer tools and API",
    icon: null,
    category_id: null,
    approved: true,
    paid: false,
    featured: true,
    click_count: 10,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    category_name: "AI",
    category_slug: "ai-tools",
    tags: [{ id: "tag-1", name: "API", slug: "api", created_at: "2026-01-01T00:00:00.000Z" }],
    avg_rating: 4.8,
    review_count: 12,
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440099",
    title: "Cloud VPS",
    url: "https://vps.example.com",
    description: "Cloud server hosting",
    icon: null,
    category_id: null,
    approved: true,
    paid: false,
    featured: false,
    click_count: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    category_name: "Cloud",
    category_slug: "cloud-vps",
    tags: [{ id: "tag-2", name: "Free", slug: "free", created_at: "2026-01-01T00:00:00.000Z" }],
    avg_rating: 3.5,
    review_count: 2,
  },
];

function makeParams(overrides: Partial<SearchParams> = {}): SearchParams {
  return {
    q: "",
    category: undefined,
    limit: 5,
    semantic: false,
    filters: {
      category: undefined,
      tagSlugs: [],
      minRating: null,
      popularity: null,
    },
    ...overrides,
  };
}

function expectSuccessBody(body: SearchApiBody): SearchSuccessBody {
  if ("error" in body) {
    throw new Error(`Expected successful search body, got error: ${body.error}`);
  }
  return body;
}

function makeFuse(links: NavLink[]): Fuse<NavLink> {
  return new Fuse(links, {
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

function createSearchPoolAdapter(
  links: NavLink[] = sampleLinks
): SearchAdapters["getSearchPool"] {
  return vi.fn(async (category?: string, filters?: SearchFilters) => {
    let pool = links;
    if (category && category !== "all") {
      pool = links.filter((link) => link.category_slug === category);
    }
    pool = applySearchFilters(pool, filters);

    return {
      fuse: makeFuse(pool),
      links: pool,
      allLinks: links,
    };
  });
}

function createAdapters(
  overrides: Partial<Omit<SearchAdapters, "logger">> & {
    logger?: Partial<SearchAdapters["logger"]>;
  } = {}
): SearchAdapters {
  const { logger: loggerOverrides, ...adapterOverrides } = overrides;
  const loggerAdapter: SearchAdapters["logger"] = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    ...loggerOverrides,
  };

  return {
    getSearchPool: createSearchPoolAdapter(),
    getEmbedding: vi.fn(async () => null),
    searchSemantic: vi.fn(async () => []),
    now: vi.fn(() => 10_000),
    ...adapterOverrides,
    logger: loggerAdapter,
  };
}

function semanticResult(link: NavLink, similarity: number): SearchResult {
  return {
    id: link.id,
    title: link.title,
    url: link.url,
    description: link.description,
    icon: link.icon,
    category_name: link.category_name,
    category_slug: link.category_slug,
    featured: link.featured,
    paid: link.paid,
    click_count: link.click_count,
    tags: link.tags,
    review_count: link.review_count,
    avg_rating: link.avg_rating,
    similarity,
    source: "semantic",
  };
}

describe("executeSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty search experience with no-store for empty queries", async () => {
    const adapters = createAdapters();

    const result = await executeSearch({
      params: makeParams(),
      requestId: "req-empty",
      startedAt: 10_000,
      adapters,
    });
    const body = expectSuccessBody(result.body);

    expect(result.status).toBe(200);
    expect(result.headers).toEqual({
      "Cache-Control": "no-store",
      "x-request-id": "req-empty",
    });
    expect(body).toMatchObject({
      results: [],
      total: 0,
      query: "",
      mode: "fuse",
      expandedTerms: [],
      appliedSynonyms: [],
    });
    expect(body.facets.categories.length).toBeGreaterThan(0);
    expect(body.suggestions.length).toBeGreaterThan(0);
    expect(body.recommendations.length).toBeGreaterThan(0);
  });

  it("returns decorated Fuse results with facets and suggestions", async () => {
    const adapters = createAdapters();

    const result = await executeSearch({
      params: makeParams({ q: "api" }),
      requestId: "req-fuse",
      startedAt: 10_000,
      adapters,
    });
    const body = expectSuccessBody(result.body);

    expect(result.status).toBe(200);
    expect(result.headers).toMatchObject({
      "Cache-Control": "no-store",
      "x-request-id": "req-fuse",
    });
    expect(body.mode).toBe("fuse");
    expect(body.results[0].id).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(body.results[0].searchMeta?.explanation.label).toContain("关键词命中");
    expect(body.facets.tags.some((tag) => tag.value === "api")).toBe(true);
    expect(body.suggestions.length).toBeGreaterThan(0);
  });

  it("skips semantic adapters for short semantic queries", async () => {
    const adapters = createAdapters();

    const result = await executeSearch({
      params: makeParams({ q: "go", semantic: true }),
      requestId: "req-short",
      startedAt: 10_000,
      adapters,
    });
    const body = expectSuccessBody(result.body);

    expect(result.status).toBe(200);
    expect(body.mode).toBe("semantic");
    expect(body.fallbackReason).toBe("short_query");
    expect(adapters.getEmbedding).not.toHaveBeenCalled();
    expect(adapters.searchSemantic).not.toHaveBeenCalled();
  });

  it("falls back to Fuse when embedding adapter is unavailable", async () => {
    const adapters = createAdapters({
      getEmbedding: vi.fn(async () => null),
    });

    const result = await executeSearch({
      params: makeParams({ q: "openai", semantic: true }),
      requestId: "req-no-embed",
      startedAt: 10_000,
      adapters,
    });
    const body = expectSuccessBody(result.body);

    expect(result.status).toBe(200);
    expect(body.mode).toBe("semantic");
    expect(body.fallbackReason).toBe("embedding_unavailable");
    expect(body.results.length).toBeGreaterThan(0);
    expect(adapters.getEmbedding).toHaveBeenCalledWith("openai");
    expect(adapters.searchSemantic).not.toHaveBeenCalled();
  });

  it("falls back to Fuse when semantic search returns no candidates", async () => {
    const adapters = createAdapters({
      getEmbedding: vi.fn(async () => Array(512).fill(0.1)),
      searchSemantic: vi.fn(async () => []),
    });

    const result = await executeSearch({
      params: makeParams({ q: "openai", semantic: true }),
      requestId: "req-empty-semantic",
      startedAt: 10_000,
      adapters,
    });
    const body = expectSuccessBody(result.body);

    expect(result.status).toBe(200);
    expect(body.mode).toBe("semantic");
    expect(body.fallbackReason).toBe("semantic_empty");
    expect(adapters.searchSemantic).toHaveBeenCalled();
    expect(body.results.length).toBeGreaterThan(0);
  });

  it("starts embedding generation in parallel with loading the search pool", async () => {
    let releasePool!: (value: Awaited<ReturnType<SearchAdapters["getSearchPool"]>>) => void;
    const getSearchPool = vi.fn(() => new Promise<Awaited<ReturnType<SearchAdapters["getSearchPool"]>>>((resolve) => {
      releasePool = resolve;
    }));
    const getEmbedding = vi.fn(async () => Array(512).fill(0.1));
    const adapters = createAdapters({ getSearchPool, getEmbedding });

    const pending = executeSearch({
      params: makeParams({ q: "openai", semantic: true }),
      requestId: "req-parallel",
      adapters,
    });
    await Promise.resolve();

    expect(getSearchPool).toHaveBeenCalledTimes(1);
    expect(getEmbedding).toHaveBeenCalledWith("openai");
    releasePool(await createSearchPoolAdapter()());
    await pending;
  });

  it("excludes semantic candidates that fail active filters", async () => {
    const cloudLink = sampleLinks[1];
    const adapters = createAdapters({
      getEmbedding: vi.fn(async () => Array(512).fill(0.1)),
      searchSemantic: vi.fn(async () => [semanticResult(cloudLink, 0.92)]),
    });

    const result = await executeSearch({
      params: makeParams({
        q: "cloud",
        semantic: true,
        filters: {
          category: undefined,
          tagSlugs: ["api"],
          minRating: null,
          popularity: null,
        },
      }),
      requestId: "req-filtered-semantic",
      startedAt: 10_000,
      adapters,
    });
    const body = expectSuccessBody(result.body);

    expect(result.status).toBe(200);
    expect(body.mode).toBe("semantic");
    expect(body.results.map((item) => item.id)).not.toContain(cloudLink.id);
  });

  it("logs search telemetry without raw query text", async () => {
    const loggerInfo = vi.fn<SearchAdapters["logger"]["info"]>();
    const adapters = createAdapters({
      logger: { info: loggerInfo },
    });

    await executeSearch({
      params: makeParams({ q: "openai" }),
      requestId: "req-telemetry",
      startedAt: 10_000,
      adapters,
    });

    expect(loggerInfo).toHaveBeenCalledWith(
      "Search API completed",
      expect.objectContaining({
        event: "search_request",
        requestId: "req-telemetry",
        queryLength: 6,
        queryHash: expect.any(String),
        responseMode: "fuse",
      })
    );
    expect(JSON.stringify(loggerInfo.mock.calls)).not.toContain("openai");
  });

  it("uses adapter clock and logger for error responses", async () => {
    const loggerError = vi.fn<SearchAdapters["logger"]["error"]>();
    const now = vi.fn<SearchAdapters["now"]>()
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_250);
    const adapters = createAdapters({
      getSearchPool: vi.fn(async () => {
        throw new Error("pool failed");
      }),
      logger: { error: loggerError },
      now,
    });

    const result = await executeSearch({
      params: makeParams({ q: "openai" }),
      requestId: "req-error",
      adapters,
    });

    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "Search failed", results: [], total: 0 });
    expect(loggerError).toHaveBeenCalledWith(
      "Search API error",
      expect.objectContaining({
        event: "search_request_failed",
        requestId: "req-error",
        durationMs: 250,
      }),
      expect.any(Error)
    );
  });
});
