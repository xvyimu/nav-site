import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn(async () => ({ data: [], error: null }));
const createServiceRoleClient = vi.fn(() => ({ rpc }));

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

describe("searchSemantic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.EMBED_SEMANTIC_RPC;
    delete process.env.EMBED_PROVIDER;
  });

  afterEach(() => {
    delete process.env.EMBED_SEMANTIC_RPC;
    delete process.env.EMBED_PROVIDER;
  });

  it("uses the default 512-d semantic RPC when no override is configured", async () => {
    const { searchSemantic } = await import("@/lib/search/semantic");

    await searchSemantic([0.1, 0.2, 0.3], 5);

    expect(rpc).toHaveBeenCalledWith("search_links_semantic", {
      query_embedding: [0.1, 0.2, 0.3],
      match_count: 5,
    });
  });

  it("uses EMBED_SEMANTIC_RPC for the Cloudflare 1024-d semantic RPC", async () => {
    process.env.EMBED_SEMANTIC_RPC = " search_links_semantic_v2 ";
    const { searchSemantic } = await import("@/lib/search/semantic");

    await searchSemantic([0.1, 0.2, 0.3], 5);

    expect(rpc).toHaveBeenCalledWith("search_links_semantic_v2", {
      query_embedding: [0.1, 0.2, 0.3],
      match_count: 5,
    });
  });

  it("derives the 1024-d RPC from EMBED_PROVIDER when no override is configured", async () => {
    process.env.EMBED_PROVIDER = "cloudflare";
    const { searchSemantic } = await import("@/lib/search/semantic");

    await searchSemantic([0.1, 0.2, 0.3], 5);

    expect(rpc).toHaveBeenCalledWith("search_links_semantic_v2", {
      query_embedding: [0.1, 0.2, 0.3],
      match_count: 5,
    });
  });
});
