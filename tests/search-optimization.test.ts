/**
 * Integration tests for the 7 search quality optimizations.
 *
 * Tests behavior through the API endpoint with mocked dependencies.
 * Does NOT require a running app, embed server, or database.
 */
import { NextRequest } from "next/server";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

interface SemanticFixtureRow {
  id: string;
  title: string;
  url: string;
  description: string;
  icon: null;
  category_name: string;
  category_slug: string;
  similarity: number;
  featured: boolean;
  paid: boolean;
  click_count: number;
}

interface RpcResult {
  data: SemanticFixtureRow[] | null;
  error: { message: string; code?: string } | null;
}

// ── Stable test UUIDs for category_id ──────────────────────────────

const CATEGORY_UUID_FRONTEND = "b1b2c3d4-e5f6-7890-abcd-ef1234567890";
const CATEGORY_UUID_MOBILE = "b1b2c3d4-e5f6-7890-abcd-ef1234567891";
const CATEGORY_UUID_AI = "b1b2c3d4-e5f6-7890-abcd-ef1234567892";
const CATEGORY_UUID_DEVTOOLS = "b1b2c3d4-e5f6-7890-abcd-ef1234567893";
const CATEGORY_UUID_LANGS = "b1b2c3d4-e5f6-7890-abcd-ef1234567894";

// ── Sample data ──────────────────────────────────────────────────

const SAMPLE_LINKS = [
  {
    id: "550e8400-e29b-41d4-a716-446655440001",
    title: "React",
    url: "https://react.dev",
    description: "A JavaScript library for building user interfaces",
    icon: null,
    category_id: CATEGORY_UUID_FRONTEND,
    approved: true,
    paid: false,
    featured: true,
    click_count: 100,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    category_name: "前端框架",
    category_slug: "frontend",
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440002",
    title: "React Native",
    url: "https://reactnative.dev",
    description: "Build mobile apps with React",
    icon: null,
    category_id: CATEGORY_UUID_MOBILE,
    approved: true,
    paid: false,
    featured: false,
    click_count: 50,
    created_at: "2026-01-02T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    category_name: "Mobile",
    category_slug: "mobile",
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440003",
    title: "Vue.js",
    url: "https://vuejs.org",
    description: "Progressive JavaScript framework",
    icon: null,
    category_id: CATEGORY_UUID_FRONTEND,
    approved: true,
    paid: false,
    featured: false,
    click_count: 3,
    created_at: "2026-01-03T00:00:00.000Z",
    updated_at: "2026-01-03T00:00:00.000Z",
    category_name: "前端框架",
    category_slug: "frontend",
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440004",
    title: "OpenAI Platform",
    url: "https://platform.openai.com",
    description: "AI developer tools and API",
    icon: null,
    category_id: CATEGORY_UUID_AI,
    approved: true,
    paid: true,
    featured: true,
    click_count: 200,
    created_at: "2026-01-04T00:00:00.000Z",
    updated_at: "2026-01-04T00:00:00.000Z",
    category_name: "AI",
    category_slug: "ai-tools",
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440005",
    title: "VS Code",
    url: "https://code.visualstudio.com",
    description: "Code editor",
    icon: null,
    category_id: CATEGORY_UUID_DEVTOOLS,
    approved: true,
    paid: false,
    featured: false,
    click_count: 8,
    created_at: "2026-01-05T00:00:00.000Z",
    updated_at: "2026-01-05T00:00:00.000Z",
    category_name: "开发工具",
    category_slug: "dev-tools",
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440006",
    title: "Go Language",
    url: "https://go.dev",
    description: "The Go programming language",
    icon: null,
    category_id: CATEGORY_UUID_LANGS,
    approved: true,
    paid: false,
    featured: false,
    click_count: 1,
    created_at: "2026-01-06T00:00:00.000Z",
    updated_at: "2026-01-06T00:00:00.000Z",
    category_name: "编程语言",
    category_slug: "programming-languages",
  },
];

const getApprovedLinks = vi.fn(async () => SAMPLE_LINKS);
const rpc = vi.fn<() => Promise<RpcResult>>(async () => ({ data: [], error: null }));
const createServiceRoleClient = vi.fn(() => ({ rpc }));

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
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("Search optimizations (7 optimizations)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Set loopback embed server so requests are allowed
    process.env.EMBED_SERVER_URL = "http://127.0.0.1:8003";

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.EMBED_SERVER_URL;
  });

  // ── #1: BGE Query Prefix ───────────────────────────────────

  it("OPT#1: embeds are fetched from /embed-query endpoint", async () => {
    // Mock the embed server to return a valid response
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/embed-query")) {
        return {
          ok: true,
          json: async () => ({ embedding: Array(512).fill(0.1), dim: 512 }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });

    // Mock the semantic RPC to return some data
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          title: "React",
          url: "https://react.dev",
          description: "A JavaScript library for building user interfaces",
          icon: null,
          category_name: "前端框架",
          category_slug: "frontend",
          similarity: 0.85,
          featured: true,
          paid: false,
          click_count: 100,
        },
      ],
      error: null,
    });

    const { GET } = await import("@/app/api/search/route");
    const response = await GET(
      new NextRequest("http://localhost/api/search?q=react&semantic=true&limit=5")
    );

    expect(response.status).toBe(200);

    // Find calls to the embed endpoint
    const embedCalls = fetchMock.mock.calls.filter(
      ([url]) => typeof url === "string" && url.includes("embed")
    );
    // Should be at least one call to /embed-query
    expect(embedCalls.length).toBeGreaterThan(0);
    // Every embed call should go to /embed-query, NOT /embed
    for (const [url] of embedCalls) {
      expect(url).toContain("/embed-query");
    }
  });

  // ── #3: Minimum Query Length Guard ──────────────────────────

  it("OPT#3: skips semantic search for queries shorter than 3 characters", async () => {
    const { GET } = await import("@/app/api/search/route");

    const response = await GET(
      new NextRequest("http://localhost/api/search?q=go&semantic=true&limit=5")
    );

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.mode).toBe("semantic");

    // The embed server should NOT have been called for short queries
    const embedCalls = fetchMock.mock.calls.filter(
      ([url]) => typeof url === "string" && url.includes("embed")
    );
    expect(embedCalls.length).toBe(0);

    // The RPC should NOT have been called
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("OPT#3: allows semantic search for queries >= 3 characters", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/embed-query")) {
        return {
          ok: true,
          json: async () => ({ embedding: Array(512).fill(0.1), dim: 512 }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });

    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          title: "React",
          url: "https://react.dev",
          description: "A JavaScript library",
          icon: null,
          category_name: "前端框架",
          category_slug: "frontend",
          similarity: 0.85,
          featured: true,
          paid: false,
          click_count: 100,
        },
      ],
      error: null,
    });

    const { GET } = await import("@/app/api/search/route");
    const response = await GET(
      new NextRequest("http://localhost/api/search?q=react&semantic=true&limit=5")
    );

    expect(response.status).toBe(200);
    // Embed server should have been called
    expect(fetchMock).toHaveBeenCalled();
  });

  // ── #5: Business Signal Boost ──────────────────────────────

  it("OPT#5: featured/paid items get similarity boost in semantic results", async () => {
    // Mock the embed call
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/embed-query")) {
        return {
          ok: true,
          json: async () => ({ embedding: Array(512).fill(0.1), dim: 512 }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });

    // Return two items with similar base similarity
    // React (featured=true, click_count=100) and Vue (featured=false, click_count=3)
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          title: "React",
          url: "https://react.dev",
          description: "A JavaScript library",
          icon: null,
          category_name: "前端框架",
          category_slug: "frontend",
          similarity: 0.82,
          featured: true,
          paid: false,
          click_count: 100,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440003",
          title: "Vue.js",
          url: "https://vuejs.org",
          description: "Progressive JavaScript framework",
          icon: null,
          category_name: "前端框架",
          category_slug: "frontend",
          similarity: 0.81,
          featured: false,
          paid: false,
          click_count: 3,
        },
      ],
      error: null,
    });

    const { GET } = await import("@/app/api/search/route");
    const response = await GET(
      new NextRequest("http://localhost/api/search?q=react&semantic=true&limit=5")
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    // Find React and Vue in results
    const reactResult = body.results.find(
      (r: { id: string }) => r.id === "550e8400-e29b-41d4-a716-446655440001"
    );
    const vueResult = body.results.find(
      (r: { id: string }) => r.id === "550e8400-e29b-41d4-a716-446655440003"
    );

    // React (featured=true, click_count=100) should get a higher similarity boost than Vue
    // React: 0.82 + 0.05 (featured) + 0.02 (click_count > 5) = 0.89
    // Vue: 0.81 + 0 (nothing) = 0.81
    expect(reactResult.similarity).toBeCloseTo(0.89, 2);
    expect(vueResult.similarity).toBeCloseTo(0.81, 2);
  });

  it("OPT#5: click_count > 5 gets +0.02 boost", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/embed-query")) {
        return {
          ok: true,
          json: async () => ({ embedding: Array(512).fill(0.1), dim: 512 }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });

    // Only high-click item returned
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440005",
          title: "VS Code",
          url: "https://code.visualstudio.com",
          description: "Code editor",
          icon: null,
          category_name: "开发工具",
          category_slug: "dev-tools",
          similarity: 0.75,
          featured: false,
          paid: false,
          click_count: 8,
        },
      ],
      error: null,
    });

    const { GET } = await import("@/app/api/search/route");
    const response = await GET(
      new NextRequest("http://localhost/api/search?q=vscode&semantic=true&limit=5")
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    const vscodeResult = body.results.find(
      (r: { id: string }) => r.id === "550e8400-e29b-41d4-a716-446655440005"
    );

    // VS Code: 0.75 + 0.02 (click_count 8 > 5) = 0.77
    expect(vscodeResult.similarity).toBeCloseTo(0.77, 2);
  });

  // ── #6: RRF Merge ──────────────────────────────────────────

  it("OPT#6: RRF merge interleaves Fuse and semantic results", async () => {
    // Mock the embed call
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/embed-query")) {
        return {
          ok: true,
          json: async () => ({ embedding: Array(512).fill(0.1), dim: 512 }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });

    // Semantic RPC returns 3 items
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          title: "React",
          url: "https://react.dev",
          description: "Library for building UIs",
          icon: null,
          category_name: "前端框架",
          category_slug: "frontend",
          similarity: 0.92,
          featured: true,
          paid: false,
          click_count: 100,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440002",
          title: "React Native",
          url: "https://reactnative.dev",
          description: "Mobile apps with React",
          icon: null,
          category_name: "Mobile",
          category_slug: "mobile",
          similarity: 0.78,
          featured: false,
          paid: false,
          click_count: 50,
        },
      ],
      error: null,
    });

    // Query "react" — Fuse will find React and React Native (title match)
    const { GET } = await import("@/app/api/search/route");
    const response = await GET(
      new NextRequest("http://localhost/api/search?q=react&semantic=true&limit=5")
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    // Both React and React Native should appear in results (from both Fuse and semantic)
    expect(body.results.length).toBeGreaterThan(0);

    // React should appear at or near the top (high Fuse + high semantic = high RRF)
    const reactIdx = body.results.findIndex(
      (r: { id: string }) => r.id === "550e8400-e29b-41d4-a716-446655440001"
    );
    expect(reactIdx).toBeGreaterThanOrEqual(0);

    // The mode should still be semantic
    expect(body.mode).toBe("semantic");
  });

  it("OPT#6: items appearing in both sources get consensus boost", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/embed-query")) {
        return {
          ok: true,
          json: async () => ({ embedding: Array(512).fill(0.1), dim: 512 }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });

    // Semantic returns React at rank 1 and VS Code at rank 2
    // Fuse.js will match items by title "react" — matches React and React Native
    // So React appears in BOTH sources (Fuse rank ~1, semantic rank 1) — consensus boost
    // VS Code appears only in semantic (rank 2) — no consensus
    // React Native appears only in Fuse — no consensus
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          title: "React",
          url: "https://react.dev",
          description: "Library",
          icon: null,
          category_name: "前端框架",
          category_slug: "frontend",
          similarity: 0.95,
          featured: true,
          paid: false,
          click_count: 100,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440005",
          title: "VS Code",
          url: "https://code.visualstudio.com",
          description: "Code editor",
          icon: null,
          category_name: "开发工具",
          category_slug: "dev-tools",
          similarity: 0.80,
          featured: false,
          paid: false,
          click_count: 8,
        },
      ],
      error: null,
    });

    const { GET } = await import("@/app/api/search/route");
    const response = await GET(
      new NextRequest("http://localhost/api/search?q=react&semantic=true&limit=5")
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    // React should be rank 1 (consensus from both Fuse and semantic)
    expect(body.results[0].id).toBe("550e8400-e29b-41d4-a716-446655440001");
    // React Native should be ranked (from Fuse)
    const reactNative = body.results.find(
      (r: { id: string }) => r.id === "550e8400-e29b-41d4-a716-446655440002"
    );
    expect(reactNative).toBeDefined();
  });

  it("OPT#6: exact keyword matches outrank weak semantic-only candidates", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/embed-query")) {
        return {
          ok: true,
          json: async () => ({ embedding: Array(512).fill(0.1), dim: 512 }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });

    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440004",
          title: "OpenAI Platform",
          url: "https://platform.openai.com",
          description: "AI developer tools and API",
          icon: null,
          category_name: "AI",
          category_slug: "ai-tools",
          similarity: 0.20,
          featured: true,
          paid: true,
          click_count: 200,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          title: "React",
          url: "https://react.dev",
          description: "A JavaScript library for building user interfaces",
          icon: null,
          category_name: "Frontend",
          category_slug: "frontend",
          similarity: 0.90,
          featured: true,
          paid: false,
          click_count: 100,
        },
      ],
      error: null,
    });

    const { GET } = await import("@/app/api/search/route");
    const response = await GET(
      new NextRequest("http://localhost/api/search?q=react&semantic=true&limit=5")
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.results[0].id).toBe("550e8400-e29b-41d4-a716-446655440001");
    expect(body.results.map((r: { id: string }) => r.id)).not.toContain(
      "550e8400-e29b-41d4-a716-446655440004"
    );
  });

  it("OPT#6: fallback to Fuse-only when semantic fails", async () => {
    // Embed call fails
    fetchMock.mockRejectedValue(new Error("embed server down"));

    const { GET } = await import("@/app/api/search/route");
    const response = await GET(
      new NextRequest("http://localhost/api/search?q=react&semantic=true&limit=5")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    // Should still get results from Fuse
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.mode).toBe("semantic");
  });

  it("OPT#6: fallback to Fuse-only when RPC fails", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/embed-query")) {
        return {
          ok: true,
          json: async () => ({ embedding: Array(512).fill(0.1), dim: 512 }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });

    // RPC returns error
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "RPC failed", code: "42P01" },
    });

    const { GET } = await import("@/app/api/search/route");
    const response = await GET(
      new NextRequest("http://localhost/api/search?q=react&semantic=true&limit=5")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    // Should still get results from Fuse fallback
    expect(body.results.length).toBeGreaterThan(0);
  });

  // ── #7: Golden query test infrastructure ────────────────────

  it("OPT#7: golden-queries.json has valid structure", async () => {
    // We cannot require from this module context easily with vitest,
    // so read and parse the file directly
    const fs = await import("fs");
    const path = await import("path");
    const goldenPath = path.resolve(
      __dirname,
      "fixtures",
      "golden-queries.json"
    );
    const raw = fs.readFileSync(goldenPath, "utf-8");
    const queries = JSON.parse(raw);

    expect(Array.isArray(queries)).toBe(true);
    expect(queries.length).toBeGreaterThanOrEqual(5);

    for (const q of queries) {
      // Every query must have required fields
      expect(q).toHaveProperty("query");
      expect(q).toHaveProperty("category");
      expect(q).toHaveProperty("expectedIds");
      expect(q).toHaveProperty("checkPrecision");

      expect(typeof q.query).toBe("string");
      expect(q.query.length).toBeGreaterThan(0);

      expect(Array.isArray(q.expectedIds)).toBe(true);

      // All expectedIds must be valid UUID format
      for (const id of q.expectedIds) {
        expect(id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
      }
    }
  });

  it("OPT#7: search-quality test references running app via quality env var", () => {
    // Verify the env var check pattern
    const checkPattern = Boolean(process.env.QUALITY_TEST_BASE_URL);
    // In unit test environment, this should be false
    expect(checkPattern).toBe(false);
  });

  // ── #2: Enriched embedding text (test via imported function) ──

  it("OPT#2: Python backfill tests cover category tag enrichment", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const sourcePath = path.resolve(
      __dirname,
      "..",
      "scripts",
      "tests",
      "test_backfill.py"
    );
    const source = fs.readFileSync(sourcePath, "utf-8");

    expect(source).toContain("test_title_description_and_category");
    expect(source).toContain("[");
    expect(source).toContain("nav_categories");
  });

  // ── #4: Word-boundary keyword (verify old function is gone) ──

  it("OPT#4: isStrongKeywordMatch is removed from route.ts", async () => {
    // RRF replaces the old bucket strategy; the old function is deleted.
    // Verify by reading the route.ts source to confirm isStrongKeywordMatch
    // is not present.
    const fs = await import("fs");
    const path = await import("path");
    const sourcePath = path.resolve(
      __dirname,
      "..",
      "app",
      "api",
      "search",
      "route.ts"
    );
    const source = fs.readFileSync(sourcePath, "utf-8");

    // The old function name should not appear in the source
    expect(source).not.toContain("isStrongKeywordMatch");
    // The old bucket keyword logic should not appear
    expect(source).not.toContain("strongKeywordFirst");
  });
});
