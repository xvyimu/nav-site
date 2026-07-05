import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  SearchApiBody,
  SearchParams,
  SearchSuccessBody,
  SemanticRow,
} from "@/lib/search/types";

const sampleLinks = [
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

const getApprovedLinks = vi.fn(async () => sampleLinks);
const rpc = vi.fn<() => Promise<{ data: SemanticRow[] | null; error: { message: string } | null }>>(
  async () => ({ data: [], error: null })
);
const createServiceRoleClient = vi.fn(() => ({ rpc }));
const loggerInfo = vi.fn();

vi.mock("@/lib/repositories", () => ({
  getApprovedLinks,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: loggerInfo,
    debug: vi.fn(),
  },
}));

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

async function importUseCase() {
  return import("@/lib/search/use-case");
}

describe("executeSearch", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.EMBED_SERVER_URL;
    delete process.env.EMBED_SERVER_LOOPBACK_ENABLED;
    delete process.env.NETLIFY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns empty search experience without no-store for empty queries", async () => {
    const { executeSearch } = await importUseCase();

    const result = await executeSearch({
      params: makeParams(),
      requestId: "req-empty",
      startedAt: Date.now(),
    });
    const body = expectSuccessBody(result.body);

    expect(result.status).toBe(200);
    expect(result.headers).toEqual({ "x-request-id": "req-empty" });
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
    const { executeSearch } = await importUseCase();

    const result = await executeSearch({
      params: makeParams({ q: "api" }),
      requestId: "req-fuse",
      startedAt: Date.now(),
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

  it("skips semantic dependencies for short semantic queries", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { executeSearch } = await importUseCase();

    const result = await executeSearch({
      params: makeParams({ q: "go", semantic: true }),
      requestId: "req-short",
      startedAt: Date.now(),
    });
    const body = expectSuccessBody(result.body);

    expect(result.status).toBe(200);
    expect(body.mode).toBe("semantic");
    expect(body.fallbackReason).toBe("short_query");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("falls back to Fuse when embedding is unavailable", async () => {
    process.env.EMBED_SERVER_URL = "https://embeddings.example.com";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { executeSearch } = await importUseCase();

    const result = await executeSearch({
      params: makeParams({ q: "openai", semantic: true }),
      requestId: "req-no-embed",
      startedAt: Date.now(),
    });
    const body = expectSuccessBody(result.body);

    expect(result.status).toBe(200);
    expect(body.mode).toBe("semantic");
    expect(body.fallbackReason).toBe("embedding_unavailable");
    expect(body.results.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("does not call loopback embedding services from serverless runtimes", async () => {
    process.env.EMBED_SERVER_URL = "http://127.0.0.1:8003";
    process.env.NETLIFY = "true";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { executeSearch } = await importUseCase();

    const result = await executeSearch({
      params: makeParams({ q: "openai", semantic: true }),
      requestId: "req-serverless-loopback",
      startedAt: Date.now(),
    });
    const body = expectSuccessBody(result.body);

    expect(result.status).toBe(200);
    expect(body.mode).toBe("semantic");
    expect(body.fallbackReason).toBe("embedding_unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("falls back to Fuse when semantic search returns no candidates", async () => {
    process.env.EMBED_SERVER_URL = "http://127.0.0.1:8003";
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ embedding: Array(512).fill(0.1) }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    rpc.mockResolvedValueOnce({ data: [], error: null });
    const { executeSearch } = await importUseCase();

    const result = await executeSearch({
      params: makeParams({ q: "openai", semantic: true }),
      requestId: "req-empty-semantic",
      startedAt: Date.now(),
    });
    const body = expectSuccessBody(result.body);

    expect(result.status).toBe(200);
    expect(body.mode).toBe("semantic");
    expect(body.fallbackReason).toBe("semantic_empty");
    expect(fetchMock).toHaveBeenCalled();
    expect(createServiceRoleClient).toHaveBeenCalled();
    expect(body.results.length).toBeGreaterThan(0);
  });

  it("excludes semantic candidates that fail active filters", async () => {
    process.env.EMBED_SERVER_URL = "http://127.0.0.1:8003";
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ embedding: Array(512).fill(0.1) }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440099",
          title: "Cloud VPS",
          url: "https://vps.example.com",
          description: "Cloud server hosting",
          icon: null,
          category_name: "Cloud",
          category_slug: "cloud-vps",
          similarity: 0.92,
          featured: false,
          paid: false,
          click_count: 0,
        },
      ],
      error: null,
    });
    const { executeSearch } = await importUseCase();

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
      startedAt: Date.now(),
    });
    const body = expectSuccessBody(result.body);

    expect(result.status).toBe(200);
    expect(body.mode).toBe("semantic");
    expect(body.results.map((item) => item.id)).not.toContain("550e8400-e29b-41d4-a716-446655440099");
  });

  it("logs search telemetry without raw query text", async () => {
    const { executeSearch } = await importUseCase();

    await executeSearch({
      params: makeParams({ q: "openai" }),
      requestId: "req-telemetry",
      startedAt: Date.now(),
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
});
