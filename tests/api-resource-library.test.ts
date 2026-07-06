import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

interface QueryResponse {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
  count?: number | null;
}

function query(response: QueryResponse) {
  return {
    data: response.data ?? null,
    error: response.error ?? null,
    count: response.count ?? null,
    select: vi.fn(function (this: unknown) { return this; }),
    order: vi.fn(function (this: unknown) { return this; }),
    limit: vi.fn(function (this: unknown) { return this; }),
    eq: vi.fn(function (this: unknown) { return this; }),
    gte: vi.fn(function (this: unknown) { return this; }),
    abortSignal: vi.fn(function (this: unknown) { return this; }),
    insert: vi.fn(function (this: unknown) { return this; }),
    maybeSingle: vi.fn(async () => response),
  };
}

interface ImportRouteEnv {
  anonKey?: string;
  publicPagesSource?: string;
  publicRatingStatsRpc?: string;
  serviceRole?: string;
}

async function importRoute<T>(path: string, env: ImportRouteEnv = {}): Promise<T> {
  vi.resetModules();
  vi.stubEnv("RESOURCE_LIBRARY_SERVICE_ROLE_KEY", env.serviceRole ?? "test-service-role");
  if (env.anonKey !== undefined) vi.stubEnv("RESOURCE_LIBRARY_ANON_KEY", env.anonKey);
  if (env.publicPagesSource !== undefined) {
    vi.stubEnv("RESOURCE_LIBRARY_PUBLIC_PAGES_SOURCE", env.publicPagesSource);
  }
  if (env.publicRatingStatsRpc !== undefined) {
    vi.stubEnv("RESOURCE_LIBRARY_PUBLIC_RATING_STATS_RPC", env.publicRatingStatsRpc);
  }
  return import(path) as Promise<T>;
}

describe("resource library API routes", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    mocks.loggerWarn.mockReset();
    mocks.loggerError.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("normalizes browse results and adds a short cache header", async () => {
    const pages = query({
      data: [
        {
          id: "0194b64d-5cb6-7330-a273-1ab8f926e169",
          title: "Example",
          url: "https://example.com",
          domain: "example.com",
          summary: null,
          category: null,
          tags: null,
          crawled_at: null,
        },
      ],
      error: null,
    });
    mocks.createClient.mockReturnValue({ from: vi.fn(() => pages) });

    const { GET } = await importRoute<typeof import("@/app/api/resource-browse/route")>(
      "@/app/api/resource-browse/route"
    );

    const response = await GET(new Request("http://localhost/api/resource-browse?limit=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    expect(body.results).toEqual([
      {
        id: "0194b64d-5cb6-7330-a273-1ab8f926e169",
        title: "Example",
        url: "https://example.com",
        domain: "example.com",
        summary: "",
        category: "Other",
        tags: [],
        crawled_at: "",
        rank: 0,
      },
    ]);
    expect(pages.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("uses the resource library anon key and public pages source for browse when configured", async () => {
    const pages = query({ data: [], error: null });
    const from = vi.fn(() => pages);
    mocks.createClient.mockReturnValue({ from });

    const { GET } = await importRoute<typeof import("@/app/api/resource-browse/route")>(
      "@/app/api/resource-browse/route",
      { anonKey: "test-anon-key", publicPagesSource: "public_pages" }
    );

    const response = await GET(new Request("http://localhost/api/resource-browse?limit=1"));

    expect(response.status).toBe(200);
    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://ihnmfsfbfnctgkhxmghk.supabase.co",
      "test-anon-key",
      expect.any(Object)
    );
    expect(from).toHaveBeenCalledWith("public_pages");
  });

  it("does not expose vector RPC error details to the client", async () => {
    mocks.createClient.mockReturnValue({
      rpc: vi.fn(() => ({
        error: {
          code: "PGRST202",
          message: "function public.search_pages_vector does not exist",
        },
      })),
    });

    const { GET } = await importRoute<typeof import("@/app/api/resource-search-status/route")>(
      "@/app/api/resource-search-status/route"
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    expect(body).toEqual({ available: false, reason: "rpc_unavailable" });
    expect(body).not.toHaveProperty("error");
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "Resource vector search RPC unavailable",
      expect.objectContaining({ source: "resource-search-status", code: "PGRST202" })
    );
  });

  it("rejects invalid resource search requests before calling the upstream API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("RESOURCE_LIBRARY_API_KEY", "server-search-key");

    const { POST } = await importRoute<typeof import("@/app/api/resource-search/route")>(
      "@/app/api/resource-search/route"
    );

    const response = await POST(
      new Request("http://localhost/api/resource-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "   ", mode: "fts", limit: 50 }),
      })
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a generic 503 when the resource search API key is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await importRoute<typeof import("@/app/api/resource-search/route")>(
      "@/app/api/resource-search/route"
    );

    const response = await POST(
      new Request("http://localhost/api/resource-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "design", mode: "fts", limit: 10 }),
      })
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "资源搜索服务未配置" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proxies resource search through the server without exposing the upstream key", async () => {
    vi.stubEnv("RESOURCE_LIBRARY_API_KEY", "server-search-key");
    const upstreamResults = [
      {
        id: "0194b64d-5cb6-7330-a273-1ab8f926e169",
        title: "Design Example",
        url: "https://example.com/design",
        domain: "example.com",
        summary: null,
        category: null,
        tags: ["design"],
        crawled_at: null,
        rank: 0.9,
      },
    ];
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ results: upstreamResults }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await importRoute<typeof import("@/app/api/resource-search/route")>(
      "@/app/api/resource-search/route"
    );

    const response = await POST(
      new Request("http://localhost/api/resource-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "  design  ", mode: "fts", limit: 25 }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      results: [
        {
          id: "0194b64d-5cb6-7330-a273-1ab8f926e169",
          title: "Design Example",
          url: "https://example.com/design",
          domain: "example.com",
          summary: "",
          category: "Other",
          tags: ["design"],
          crawled_at: "",
          rank: 0.9,
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain("server-search-key");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ihnmfsfbfnctgkhxmghk.supabase.co/functions/v1/search-api-v3",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          apikey: "server-search-key",
        }),
        body: JSON.stringify({ query: "design", mode: "fts", limit: 25 }),
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("does not leak upstream resource search failure details", async () => {
    vi.stubEnv("RESOURCE_LIBRARY_API_KEY", "server-search-key");
    const fetchMock = vi.fn(async () =>
      new Response("upstream failure with server-search-key", { status: 500 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await importRoute<typeof import("@/app/api/resource-search/route")>(
      "@/app/api/resource-search/route"
    );

    const response = await POST(
      new Request("http://localhost/api/resource-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "design", mode: "fts", limit: 10 }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({ error: "资源搜索失败" });
    expect(JSON.stringify(body)).not.toContain("server-search-key");
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "Resource search upstream request failed",
      expect.objectContaining({ source: "resource-search", status: 500 })
    );
  });

  it("rejects invalid rating stats page_id before opening a DB client", async () => {
    const { GET } = await importRoute<typeof import("@/app/api/resource-ratings/route")>(
      "@/app/api/resource-ratings/route"
    );

    const response = await GET(
      new Request("http://localhost/api/resource-ratings?page_id=not-a-uuid")
    );

    expect(response.status).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects invalid resource detail ids before opening a DB client", async () => {
    const mod = await importRoute<typeof import("@/app/resources/[id]/page")>(
      "@/app/resources/[id]/page"
    );

    await expect(
      mod.default({ params: Promise.resolve({ id: "not-a-uuid" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("adds an abort signal to rating stats queries", async () => {
    const stats = query({ count: 2, error: null });
    mocks.createClient.mockReturnValue({ from: vi.fn(() => stats) });

    const { GET } = await importRoute<typeof import("@/app/api/resource-ratings/route")>(
      "@/app/api/resource-ratings/route"
    );

    const response = await GET(
      new Request(
        "http://localhost/api/resource-ratings?page_id=0194b64d-5cb6-7330-a273-1ab8f926e169"
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=60");
    expect(await response.json()).toEqual({ count: 2 });
    expect(stats.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("uses the public rating stats RPC before service role for rating stats when anon is configured", async () => {
    const stats = query({ data: 3, error: null });
    const rpc = vi.fn(() => stats);
    mocks.createClient.mockReturnValue({ rpc });

    const { GET } = await importRoute<typeof import("@/app/api/resource-ratings/route")>(
      "@/app/api/resource-ratings/route",
      { anonKey: "test-anon-key", publicRatingStatsRpc: "get_public_resource_rating_count" }
    );

    const response = await GET(
      new Request(
        "http://localhost/api/resource-ratings?page_id=0194b64d-5cb6-7330-a273-1ab8f926e169"
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=60");
    expect(await response.json()).toEqual({ count: 3 });
    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://ihnmfsfbfnctgkhxmghk.supabase.co",
      "test-anon-key",
      expect.any(Object)
    );
    expect(rpc).toHaveBeenCalledWith("get_public_resource_rating_count", {
      target_page_id: "0194b64d-5cb6-7330-a273-1ab8f926e169",
    });
    expect(stats.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("rejects invalid rating payloads before opening a DB client", async () => {
    const { POST } = await importRoute<typeof import("@/app/api/resource-ratings/route")>(
      "@/app/api/resource-ratings/route"
    );

    const response = await POST(
      new Request("http://localhost/api/resource-ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page_id: "not-a-uuid",
          rating: 9,
        }),
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("does not render unsafe resource detail URLs", async () => {
    const page = query({
      data: {
        id: "0194b64d-5cb6-7330-a273-1ab8f926e169",
        title: "Unsafe",
        url: "javascript:alert(1)",
        domain: "example.com",
        summary: null,
        category: null,
        tags: null,
        crawled_at: null,
      },
      error: null,
    });
    mocks.createClient.mockReturnValue({ from: vi.fn(() => page) });

    const [mod, server] = await Promise.all([
      importRoute<typeof import("@/app/resources/[id]/page")>("@/app/resources/[id]/page"),
      import("react-dom/server"),
    ]);

    const element = await mod.default({
      params: Promise.resolve({ id: "0194b64d-5cb6-7330-a273-1ab8f926e169" }),
    });
    const html = server.renderToStaticMarkup(element);

    expect(html).toContain('href="#"');
    expect(html).not.toContain("javascript:alert");
    expect(page.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("uses the resource library anon key and public pages source for detail pages when configured", async () => {
    const page = query({
      data: {
        id: "0194b64d-5cb6-7330-a273-1ab8f926e169",
        title: "Safe",
        url: "https://example.com",
        domain: "example.com",
        summary: null,
        category: null,
        tags: null,
        crawled_at: null,
      },
      error: null,
    });
    const from = vi.fn(() => page);
    mocks.createClient.mockReturnValue({ from });

    const [mod, server] = await Promise.all([
      importRoute<typeof import("@/app/resources/[id]/page")>(
        "@/app/resources/[id]/page",
        { anonKey: "test-anon-key", publicPagesSource: "public_pages" }
      ),
      import("react-dom/server"),
    ]);

    const element = await mod.default({
      params: Promise.resolve({ id: "0194b64d-5cb6-7330-a273-1ab8f926e169" }),
    });
    const html = server.renderToStaticMarkup(element);

    expect(html).toContain("Safe");
    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://ihnmfsfbfnctgkhxmghk.supabase.co",
      "test-anon-key",
      expect.any(Object)
    );
    expect(from).toHaveBeenCalledWith("public_pages");
  });

  it("accepts a valid rating after rate-limit and page existence checks", async () => {
    const rateLimit = query({ count: 0, error: null });
    const page = query({
      data: { id: "0194b64d-5cb6-7330-a273-1ab8f926e169" },
      error: null,
    });
    const insert = query({ error: null });
    let ratingsCalls = 0;
    const from = vi.fn((table: string) => {
      if (table === "ratings") {
        ratingsCalls += 1;
        return ratingsCalls === 1 ? rateLimit : insert;
      }
      if (table === "pages") return page;
      return query({ error: null });
    });
    mocks.createClient.mockReturnValue({ from });

    const { POST } = await importRoute<typeof import("@/app/api/resource-ratings/route")>(
      "@/app/api/resource-ratings/route"
    );

    const response = await POST(
      new Request("http://localhost/api/resource-ratings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "203.0.113.10",
        },
        body: JSON.stringify({
          page_id: "0194b64d-5cb6-7330-a273-1ab8f926e169",
          rating: 5,
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(insert.insert).toHaveBeenCalledWith({
      page_id: "0194b64d-5cb6-7330-a273-1ab8f926e169",
      query_text: "",
      rating: 5,
      ip: "203.0.113.10",
    });
    expect(rateLimit.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(page.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(insert.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });
});
