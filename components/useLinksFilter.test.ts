import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLinksFilter } from "./useLinksFilter";
import type { NavLink, Category } from "@/lib/types";

// ── Helpers ──

function makeLink(overrides: Partial<NavLink> & { id: string }): NavLink {
  return {
    title: "Test Link",
    url: "https://example.com",
    description: "A test link",
    icon: null,
    category_id: null,
    approved: true,
    paid: false,
    featured: false,
    click_count: 0,
    created_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

const categories: Category[] = [
  { id: "c1", name: "云服务 & VPS", slug: "cloud-vps", description: null, icon: null, sort_order: 0, created_at: "2026-01-01T00:00:00Z" },
  { id: "c2", name: "Relay Station", slug: "free-relay", description: null, icon: null, sort_order: 1, created_at: "2026-01-01T00:00:00Z" },
];

// ── Tests ──

describe("useLinksFilter", () => {
  beforeEach(() => {
    localStorage.clear();
    // 重置 URL，避免上一个测试的筛选状态通过 URL 同步泄漏到下一个测试
    window.history.replaceState(null, "", "/");
    vi.useFakeTimers();
    // Default fetch mock: empty search results
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [], total: 0, query: "" }),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns all links when activeCategory is 'all' and no search query", () => {
    const links = [
      makeLink({ id: "l1", category_slug: "cloud-vps" }),
      makeLink({ id: "l2", category_slug: "free-relay" }),
    ];
    const { result } = renderHook(() => useLinksFilter({ categories, links }));
    expect(result.current.filtered).toHaveLength(2);
    expect(result.current.tabKeys).toHaveLength(3); // all + 2 categories
    expect(result.current.hasResults).toBe(true);
  });

  it("filters by category when activeCategory is set", () => {
    const links = [
      makeLink({ id: "l1", category_slug: "cloud-vps" }),
      makeLink({ id: "l2", category_slug: "free-relay" }),
    ];
    const { result } = renderHook(() => useLinksFilter({ categories, links }));
    act(() => result.current.setActiveCategory("cloud-vps"));
    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0].id).toBe("l1");
  });

  it("applies browse popularity and rating filters without a search query", () => {
    const links = [
      makeLink({ id: "l1", featured: true, avg_rating: 4.8, click_count: 1 }),
      makeLink({ id: "l2", featured: false, avg_rating: 3.1, click_count: 20 }),
      makeLink({ id: "l3", featured: false, paid: true, avg_rating: 4.9, click_count: 0 }),
    ];
    const { result } = renderHook(() => useLinksFilter({ categories, links }));

    act(() => result.current.setPopularityFilter("featured"));
    expect(result.current.filtered.map((link) => link.id).sort()).toEqual(["l1", "l3"]);

    act(() => {
      result.current.setPopularityFilter(null);
      result.current.setMinRatingFilter(4.5);
    });
    expect(result.current.filtered.map((link) => link.id).sort()).toEqual(["l1", "l3"]);
  });

  it("keeps featured ids out of latest dual-track and unique flatResults", () => {
    const links = [
      makeLink({
        id: "featured-new",
        featured: true,
        created_at: "2026-06-10T00:00:00Z",
        category_slug: "cloud-vps",
      }),
      makeLink({
        id: "plain-new",
        featured: false,
        created_at: "2026-06-09T00:00:00Z",
        category_slug: "cloud-vps",
      }),
    ];
    const { result } = renderHook(() => useLinksFilter({ categories, links }));
    expect(result.current.featured.some((link) => link.id === "featured-new")).toBe(true);
    expect(result.current.latest.some((link) => link.id === "featured-new")).toBe(false);
    const ids = result.current.flatResults.map((item) => item.link.id);
    expect(ids.filter((id) => id === "featured-new")).toHaveLength(1);
  });

  it("filters links by fuzzy search", async () => {
    const links = [
      makeLink({ id: "l1", title: "ChatGPT", category_slug: "cloud-vps" }),
      makeLink({ id: "l2", title: "DeepSeek", category_slug: "free-relay" }),
    ];
    // Mock server search to return l1 for query "chat"
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{
          id: "l1",
          title: "ChatGPT",
          url: "https://example.com",
          description: "A test link",
          icon: null,
          category_name: "云服务 & VPS",
          category_slug: "cloud-vps",
          featured: false,
          paid: false,
          click_count: 0,
        }],
        total: 1,
        query: "chat",
      }),
    } as never);
    const { result } = renderHook(() => useLinksFilter({ categories, links }));
    act(() => result.current.setRawSearch("chat"));
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(result.current.q).toBe("chat");
    expect(result.current.filtered.some((l) => l.id === "l1")).toBe(true);
  });

  it("sends productized search filters and preserves search metadata", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{
          id: "l1",
          title: "ChatGPT",
          url: "https://example.com",
          description: "AI API tool",
          icon: null,
          category_name: "AI",
          category_slug: "ai-tools",
          featured: true,
          paid: false,
          click_count: 12,
          tags: [{ id: "t1", name: "API", slug: "api", created_at: "2026-01-01T00:00:00Z" }],
          avg_rating: 4.8,
          review_count: 9,
          searchMeta: {
            query: "chat",
            expandedTerms: ["chat"],
            source: "hybrid",
            highlights: [{ field: "description", label: "描述", value: "AI API tool" }],
            explanation: {
              label: "混合命中 98%",
              reason: "描述 · 精选 · 热门",
              matchedFields: ["description"],
            },
          },
        }],
        facets: {
          categories: [],
          tags: [{ value: "api", label: "API", count: 1, active: true }],
          ratings: [{ value: "4", label: "4+", count: 1, active: true }],
          popularity: [{ value: "featured", label: "精选", count: 1, active: true }],
        },
        suggestions: [{ type: "tool", value: "ChatGPT", label: "ChatGPT" }],
        recommendations: [],
        total: 1,
        query: "chat",
      }),
    } as never);

    const links = [
      makeLink({
        id: "l1",
        title: "ChatGPT",
        category_slug: "ai-tools",
        tags: [{ id: "t1", name: "API", slug: "api", created_at: "2026-01-01T00:00:00Z" }],
      }),
    ];
    const { result } = renderHook(() => useLinksFilter({ categories, links }));

    act(() => result.current.toggleTag("api"));
    act(() => result.current.setMinRatingFilter(4));
    act(() => result.current.setPopularityFilter("featured"));
    act(() => result.current.setActiveCategory("ai-tools"));
    act(() => result.current.setRawSearch("chat"));
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });

    const calledUrl = String(vi.mocked(global.fetch).mock.calls[0][0]);
    expect(calledUrl).toContain("category=ai-tools");
    expect(calledUrl).toContain("tag=api");
    expect(calledUrl).toContain("minRating=4");
    expect(calledUrl).toContain("popularity=featured");
    expect(result.current.searchFacets.tags[0].active).toBe(true);
    expect(result.current.searchSuggestions[0].label).toBe("ChatGPT");
    expect(result.current.filtered[0].searchMeta?.explanation.label).toBe("混合命中 98%");
  });

  it("sorts by newest when sortMode is 'newest'", () => {
    const links = [
      makeLink({ id: "l1", created_at: "2026-06-10T00:00:00Z", category_slug: "cloud-vps" }),
      makeLink({ id: "l2", created_at: "2026-06-20T00:00:00Z", category_slug: "cloud-vps" }),
      makeLink({ id: "l3", created_at: "2026-06-01T00:00:00Z", category_slug: "cloud-vps" }),
    ];
    const { result } = renderHook(() => useLinksFilter({ categories, links }));
    act(() => result.current.setSortMode("newest"));
    expect(result.current.filtered[0].id).toBe("l2");
    expect(result.current.filtered[1].id).toBe("l1");
    expect(result.current.filtered[2].id).toBe("l3");
  });

  it("computes featured links on the 'all' tab without search", () => {
    const links = [
      makeLink({ id: "l1", featured: true, category_slug: "free-relay" }),
      makeLink({ id: "l2", featured: false, category_slug: "cloud-vps" }),
      makeLink({ id: "l3", featured: true, category_slug: "cloud-vps" }),
    ];
    const { result } = renderHook(() => useLinksFilter({ categories, links }));
    expect(result.current.featured).toHaveLength(2);
    // featured links are returned in original order (no category-based sort)
    expect(result.current.featured[0].category_slug).toBe("free-relay");
    expect(result.current.featured[1].category_slug).toBe("cloud-vps");
  });

  it("has no featured when searching", () => {
    const links = [
      makeLink({ id: "l1", featured: true, title: "Alpha", category_slug: "cloud-vps" }),
      makeLink({ id: "l2", featured: false, title: "Beta", category_slug: "cloud-vps" }),
    ];
    const { result } = renderHook(() => useLinksFilter({ categories, links }));
    act(() => result.current.setRawSearch("beta"));
    act(() => { vi.advanceTimersByTime(250); });
    expect(result.current.featured).toHaveLength(0);
  });

  it("normalizes the removed model-ranking category to all links", () => {
    window.history.replaceState(null, "", "/?cat=model-ranking");
    const categoriesWithRemovedRanking: Category[] = [
      ...categories,
      { id: "c3", name: "模型排行榜", slug: "model-ranking", description: null, icon: null, sort_order: 2, created_at: "2026-01-01T00:00:00Z" },
    ];
    const links = [makeLink({ id: "l1", category_slug: "cloud-vps" })];
    const { result } = renderHook(() => useLinksFilter({ categories: categoriesWithRemovedRanking, links }));
    expect(result.current.activeCategory).toBe("all");
    expect(result.current.tabKeys.some((tab) => tab.key === "model-ranking")).toBe(false);
    expect(result.current.filtered).toHaveLength(1);
  });

  it("handles keyboard navigation", () => {
    const links = [
      makeLink({ id: "l1", title: "Alpha", category_slug: "cloud-vps" }),
      makeLink({ id: "l2", title: "Beta", category_slug: "cloud-vps" }),
    ];
    const { result } = renderHook(() => useLinksFilter({ categories, links }));
    act(() => result.current.handleSearchKeyDown({ key: "ArrowDown", preventDefault: vi.fn() } as never));
    expect(result.current.focusedIndex).toBe(0);
    act(() => result.current.handleResultKeyDown({ key: "ArrowDown", preventDefault: vi.fn() } as never, 0));
    expect(result.current.focusedIndex).toBe(1);
  });

  it("resets focus when search or category changes", () => {
    const links = [makeLink({ id: "l1", category_slug: "cloud-vps" })];
    const { result } = renderHook(() => useLinksFilter({ categories, links }));
    act(() => result.current.setFocusedIndex(0));
    act(() => result.current.setActiveCategory("free-relay"));
    expect(result.current.focusedIndex).toBe(-1);
  });

  it("counts links per tab correctly", () => {
    const links = [
      makeLink({ id: "l1", category_slug: "cloud-vps" }),
      makeLink({ id: "l2", category_slug: "cloud-vps" }),
      makeLink({ id: "l3", category_slug: "free-relay" }),
    ];
    const { result } = renderHook(() => useLinksFilter({ categories, links }));
    const bigTech = result.current.tabCounts.find((t) => t.key === "cloud-vps");
    const relay = result.current.tabCounts.find((t) => t.key === "free-relay");
    expect(bigTech?.count).toBe(2);
    expect(relay?.count).toBe(1);
  });

  // ── URL ↔ state 同步 ──

  it("从 URL 读取初始筛选状态", () => {
    window.history.replaceState(null, "", "/?cat=cloud-vps&tag=api&minRating=4&popularity=featured&semantic=false");
    const links = [makeLink({ id: "l1", category_slug: "cloud-vps" })];
    const { result } = renderHook(() => useLinksFilter({ categories, links }));
    expect(result.current.activeCategory).toBe("cloud-vps");
    expect(result.current.activeTags).toEqual(["api"]);
    expect(result.current.minRatingFilter).toBe(4);
    expect(result.current.popularityFilter).toBe("featured");
    expect(result.current.semanticSearch).toBe(false);
  });

  it("切换分类时同步到 URL", () => {
    const links = [makeLink({ id: "l1", category_slug: "cloud-vps" })];
    const { result } = renderHook(() => useLinksFilter({ categories, links }));
    act(() => result.current.setActiveCategory("cloud-vps"));
    expect(window.location.search).toContain("cat=cloud-vps");
    act(() => result.current.toggleTag("api"));
    expect(window.location.search).toContain("tag=api");
    act(() => result.current.setMinRatingFilter(4));
    expect(window.location.search).toContain("minRating=4");
  });

  it("popstate 事件触发状态回填", () => {
    const links = [makeLink({ id: "l1", category_slug: "cloud-vps" })];
    const { result } = renderHook(() => useLinksFilter({ categories, links }));
    // 先切到 cloud-vps
    act(() => result.current.setActiveCategory("cloud-vps"));
    expect(result.current.activeCategory).toBe("cloud-vps");
    // 模拟浏览器后退到无筛选状态
    act(() => {
      window.history.replaceState(null, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.activeCategory).toBe("all");
  });
});
