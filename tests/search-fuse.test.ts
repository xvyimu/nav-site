import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getApprovedLinks: vi.fn(),
}));

vi.mock("@/lib/repositories", () => ({
  getApprovedLinks: mocks.getApprovedLinks,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

const links = [{
  id: "550e8400-e29b-41d4-a716-446655440000",
  title: "OpenAI Platform",
  slug: "openai-platform",
  url: "https://platform.openai.com",
  description: "AI developer tools",
  icon: null,
  category_id: null,
  approved: true,
  paid: false,
  featured: false,
  click_count: 10,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  category_name: "AI",
  category_slug: "ai-tools",
  tags: [],
}];

describe("search Fuse cache", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getApprovedLinks.mockResolvedValue(links);
  });

  it("reuses the cached Fuse instance for an unfiltered search pool", async () => {
    const { getSearchPool } = await import("@/lib/search/fuse");

    const first = await getSearchPool();
    const second = await getSearchPool(undefined, {
      tagSlugs: [],
      minRating: null,
      popularity: null,
    });

    expect(second.fuse).toBe(first.fuse);
    expect(mocks.getApprovedLinks).toHaveBeenCalledTimes(1);
  });

  it("shares one database load between concurrent cold search-pool requests", async () => {
    let resolveLinks!: (value: typeof links) => void;
    mocks.getApprovedLinks.mockImplementationOnce(
      () => new Promise<typeof links>((resolve) => { resolveLinks = resolve; })
    );
    const { getSearchPool } = await import("@/lib/search/fuse");

    const first = getSearchPool();
    const second = getSearchPool("ai-tools");
    await vi.waitFor(() => expect(mocks.getApprovedLinks).toHaveBeenCalledTimes(1));
    resolveLinks(links);

    const [firstPool, secondPool] = await Promise.all([first, second]);
    expect(firstPool.allLinks).toEqual(links);
    expect(secondPool.links).toEqual(links);
    expect(mocks.getApprovedLinks).toHaveBeenCalledTimes(1);
  });
});
