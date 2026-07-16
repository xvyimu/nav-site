import { NextRequest } from "next/server";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SemanticRow } from "@/lib/search/types";

const sampleLinks = [
  {
    id: "550e8400-e29b-41d4-a716-446655440000",
    title: "OpenAI Platform",
    url: "https://platform.openai.com",
    description: "AI developer tools",
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
const rpc = vi.fn(
  async (): Promise<{ data: SemanticRow[] | null; error: { message: string } | null }> => ({
    data: [],
    error: null,
  }),
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

describe("/api/search", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.EMBED_SERVER_URL;
    delete process.env.EMBED_SERVER_API_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.EMBED_SERVER_URL;
    delete process.env.EMBED_SERVER_API_KEY;
  });

  it("rejects oversized queries before loading search data", async () => {
    const { GET } = await import("@/app/api/search/route");

    const response = await GET(
      new NextRequest(`http://localhost/api/search?q=${"a".repeat(121)}`, {
        headers: { "x-request-id": "req-bad-search" },
      })
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("x-request-id")).toBe("req-bad-search");
    expect(getApprovedLinks).not.toHaveBeenCalled();
  });

  it("rejects invalid category slugs before loading search data", async () => {
    const { GET } = await import("@/app/api/search/route");

    const response = await GET(
      new NextRequest("http://localhost/api/search?q=openai&category=../admin")
    );

    expect(response.status).toBe(400);
    expect(getApprovedLinks).not.toHaveBeenCalled();
  });

  it("does not send semantic queries to remote HTTPS without API key", async () => {
    process.env.EMBED_SERVER_URL = "https://embeddings.example.com";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/search/route");
    const response = await GET(
      new NextRequest("http://localhost/api/search?q=openai&semantic=true")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("semantic");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("sends semantic queries to remote HTTPS with Bearer API key", async () => {
    process.env.EMBED_SERVER_URL = "https://embeddings.example.com";
    process.env.EMBED_SERVER_API_KEY = "remote-secret";
    const embedding = Array.from({ length: 512 }, (_, i) => (i === 0 ? 1 : 0));
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ embedding, dim: 512 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: sampleLinks[0].id,
          title: sampleLinks[0].title,
          url: sampleLinks[0].url,
          description: sampleLinks[0].description,
          icon: null,
          category_name: sampleLinks[0].category_name,
          category_slug: sampleLinks[0].category_slug,
          featured: true,
          paid: false,
          click_count: 10,
          similarity: 0.9,
        },
      ],
      error: null,
    });

    const { GET } = await import("@/app/api/search/route");
    const response = await GET(
      new NextRequest("http://localhost/api/search?q=openai&semantic=true")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://embeddings.example.com/embed-query",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer remote-secret",
        }),
        body: JSON.stringify({ text: "openai" }),
      })
    );
    expect(createServiceRoleClient).toHaveBeenCalled();
    expect(body.mode).toBe("semantic");
  });

  it("adds request telemetry without logging the raw query", async () => {
    const { GET } = await import("@/app/api/search/route");
    const response = await GET(
      new NextRequest("http://localhost/api/search?q=openai", {
        headers: { "x-request-id": "req-search-test" },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("req-search-test");
    expect(body.query).toBe("openai");

    expect(loggerInfo).toHaveBeenCalledWith(
      "Search API completed",
      expect.objectContaining({
        event: "search_request",
        requestId: "req-search-test",
        queryLength: 6,
        queryHash: expect.any(String),
        responseMode: "fuse",
        resultCount: expect.any(Number),
      })
    );
    expect(JSON.stringify(loggerInfo.mock.calls)).not.toContain("openai");
  });

  it("replaces an untrusted oversized request id", async () => {
    const { GET } = await import("@/app/api/search/route");
    const untrusted = "x".repeat(200);
    const response = await GET(
      new NextRequest("http://localhost/api/search?q=openai", {
        headers: { "x-request-id": untrusted },
      })
    );

    const requestId = response.headers.get("x-request-id");
    expect(requestId).not.toBe(untrusted);
    expect(requestId).toMatch(/^[a-f0-9-]{36}$/);
  });

  it("returns facets, suggestions, highlights, and explanations", async () => {
    const { GET } = await import("@/app/api/search/route");
    const response = await GET(
      new NextRequest("http://localhost/api/search?q=api&tag=api&minRating=4&popularity=featured")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].id).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(body.results[0].searchMeta.explanation.label).toContain("关键词命中");
    expect(body.results[0].searchMeta.highlights.length).toBeGreaterThan(0);
    expect(body.facets.tags.some((tag: { value: string; active?: boolean }) => tag.value === "api" && tag.active)).toBe(true);
    expect(body.facets.ratings.some((rating: { value: string; active?: boolean }) => rating.value === "4" && rating.active)).toBe(true);
    expect(body.facets.popularity.some((item: { value: string; active?: boolean }) => item.value === "featured" && item.active)).toBe(true);
    expect(body.suggestions.length).toBeGreaterThan(0);
  });

  it("returns zero-result recommendations when no link matches the query", async () => {
    const { GET } = await import("@/app/api/search/route");
    const response = await GET(
      new NextRequest("http://localhost/api/search?q=zzzz-not-found")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(0);
    expect(body.recommendations.length).toBeGreaterThan(0);
    expect(body.recommendations[0].title).toBe("OpenAI Platform");
  });

  it("expands common synonyms for Fuse search", async () => {
    const { GET } = await import("@/app/api/search/route");
    const response = await GET(
      new NextRequest("http://localhost/api/search?q=server")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.appliedSynonyms).toContain("vps");
    expect(body.results.some((result: { title: string }) => result.title === "Cloud VPS")).toBe(true);
  });
});
