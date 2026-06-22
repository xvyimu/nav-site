import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLinksFilter } from "./useLinksFilter";
import type { NavLink, Category } from "@/lib/types";
import type { ModelRanking } from "./ModelRanking";

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
  { id: "c1", name: "官方 API", slug: "big-tech", description: null, icon: null, sort_order: 0, created_at: "2026-01-01T00:00:00Z" },
  { id: "c2", name: "中转服务站", slug: "free-relay", description: null, icon: null, sort_order: 1, created_at: "2026-01-01T00:00:00Z" },
];

const rankings: ModelRanking[] = [
  { id: "r1", model_name: "GPT-4o", description: "OpenAI 旗舰", source: "openai", rank: 1, score: 95, created_at: "2026-06-01T00:00:00Z" },
  { id: "r2", model_name: "Claude 4", description: "Anthropic 旗舰", source: "anthropic", rank: 2, score: 90, created_at: "2026-06-01T00:00:00Z" },
];

// ── Tests ──

describe("useLinksFilter", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns all links when activeCategory is 'all' and no search query", () => {
    const links = [
      makeLink({ id: "l1", category_slug: "big-tech" }),
      makeLink({ id: "l2", category_slug: "free-relay" }),
    ];
    const { result } = renderHook(() => useLinksFilter({ categories, links, modelRankings: rankings }));
    expect(result.current.filtered).toHaveLength(2);
    expect(result.current.tabKeys).toHaveLength(3); // all + 2 categories
    expect(result.current.hasResults).toBe(true);
  });

  it("filters links by category when activeCategory is set", () => {
    const links = [
      makeLink({ id: "l1", category_slug: "big-tech" }),
      makeLink({ id: "l2", category_slug: "free-relay" }),
    ];
    const { result } = renderHook(() => useLinksFilter({ categories, links, modelRankings: rankings }));
    act(() => result.current.setActiveCategory("big-tech"));
    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0].id).toBe("l1");
  });

  it("filters links by fuzzy search", () => {
    const links = [
      makeLink({ id: "l1", title: "ChatGPT", category_slug: "big-tech" }),
      makeLink({ id: "l2", title: "DeepSeek", category_slug: "free-relay" }),
    ];
    const { result } = renderHook(() => useLinksFilter({ categories, links, modelRankings: rankings }));
    act(() => result.current.setRawSearch("chat"));
    act(() => { vi.advanceTimersByTime(250); });
    expect(result.current.q).toBe("chat");
    expect(result.current.filtered.some((l) => l.id === "l1")).toBe(true);
  });

  it("sorts by newest when sortMode is 'newest'", () => {
    const links = [
      makeLink({ id: "l1", created_at: "2026-06-10T00:00:00Z", category_slug: "big-tech" }),
      makeLink({ id: "l2", created_at: "2026-06-20T00:00:00Z", category_slug: "big-tech" }),
      makeLink({ id: "l3", created_at: "2026-06-01T00:00:00Z", category_slug: "big-tech" }),
    ];
    const { result } = renderHook(() => useLinksFilter({ categories, links, modelRankings: rankings }));
    act(() => result.current.setSortMode("newest"));
    expect(result.current.filtered[0].id).toBe("l2");
    expect(result.current.filtered[1].id).toBe("l1");
    expect(result.current.filtered[2].id).toBe("l3");
  });

  it("computes featured links on the 'all' tab without search", () => {
    const links = [
      makeLink({ id: "l1", featured: true, category_slug: "free-relay" }),
      makeLink({ id: "l2", featured: false, category_slug: "big-tech" }),
      makeLink({ id: "l3", featured: true, category_slug: "big-tech" }),
    ];
    const { result } = renderHook(() => useLinksFilter({ categories, links, modelRankings: rankings }));
    expect(result.current.featured).toHaveLength(2);
    // big-tech should come before free-relay
    expect(result.current.featured[0].category_slug).toBe("big-tech");
    expect(result.current.featured[1].category_slug).toBe("free-relay");
  });

  it("has no featured when searching", () => {
    const links = [
      makeLink({ id: "l1", featured: true, title: "Alpha", category_slug: "big-tech" }),
      makeLink({ id: "l2", featured: false, title: "Beta", category_slug: "big-tech" }),
    ];
    const { result } = renderHook(() => useLinksFilter({ categories, links, modelRankings: rankings }));
    act(() => result.current.setRawSearch("beta"));
    act(() => { vi.advanceTimersByTime(250); });
    expect(result.current.featured).toHaveLength(0);
  });

  it("shows rankings on 'all' tab and hides on category tabs without model-ranking", () => {
    const links = [makeLink({ id: "l1", category_slug: "big-tech" })];
    const { result } = renderHook(() => useLinksFilter({ categories, links, modelRankings: rankings }));
    expect(result.current.showRankings).toBe(true);
    act(() => result.current.setActiveCategory("big-tech"));
    expect(result.current.showRankings).toBe(false);
  });

  it("handles keyboard navigation", () => {
    const links = [
      makeLink({ id: "l1", title: "Alpha", category_slug: "big-tech" }),
      makeLink({ id: "l2", title: "Beta", category_slug: "big-tech" }),
    ];
    const { result } = renderHook(() => useLinksFilter({ categories, links, modelRankings: rankings }));
    act(() => result.current.handleSearchKeyDown({ key: "ArrowDown", preventDefault: vi.fn() } as any));
    expect(result.current.focusedIndex).toBe(0);
    act(() => result.current.handleResultKeyDown({ key: "ArrowDown", preventDefault: vi.fn() } as any, 0));
    expect(result.current.focusedIndex).toBe(1);
  });

  it("resets focus when search or category changes", () => {
    const links = [makeLink({ id: "l1", category_slug: "big-tech" })];
    const { result } = renderHook(() => useLinksFilter({ categories, links, modelRankings: rankings }));
    act(() => result.current.setFocusedIndex(0));
    act(() => result.current.setActiveCategory("free-relay"));
    expect(result.current.focusedIndex).toBe(-1);
  });

  it("counts links per tab correctly", () => {
    const links = [
      makeLink({ id: "l1", category_slug: "big-tech" }),
      makeLink({ id: "l2", category_slug: "big-tech" }),
      makeLink({ id: "l3", category_slug: "free-relay" }),
    ];
    const { result } = renderHook(() => useLinksFilter({ categories, links, modelRankings: rankings }));
    const bigTech = result.current.tabCounts.find((t) => t.key === "big-tech");
    const relay = result.current.tabCounts.find((t) => t.key === "free-relay");
    expect(bigTech?.count).toBe(2);
    expect(relay?.count).toBe(1);
  });
});
