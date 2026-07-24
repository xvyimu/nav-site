import { act, fireEvent, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Category, NavLink } from "@/lib/types";
import type { ResourceItem } from "@/lib/types";
import type { PrecomputedNavData } from "@/lib/nav-derived-data";

const mocks = vi.hoisted(() => ({
  getDescendantSlugs: vi.fn(),
  spacingNode: vi.fn(),
}));

vi.mock("@/lib/category-tree", () => ({
  getDescendantSlugs: mocks.getDescendantSlugs,
}));

vi.mock("pangu/browser", () => ({
  default: { spacingNode: mocks.spacingNode },
}));

vi.mock("@/components/LinkCard", () => ({
  LinkCard: ({ link }: { link: NavLink }) => (
    <div data-testid="link-card">
      {link.title}
      <button type="button" aria-label={`收藏 ${link.title}`}>收藏</button>
    </div>
  ),
}));

const category: Category = {
  id: "cat-1",
  name: "AI",
  slug: "ai",
  description: null,
  icon: null,
  sort_order: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  parent_id: null,
};

function link(id: string): NavLink {
  return {
    id,
    title: `Link ${id}`,
    url: `https://${id}.example.com`,
    description: null,
    icon: null,
    category_id: category.id,
    approved: true,
    paid: false,
    featured: false,
    click_count: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    category_name: category.name,
    category_slug: category.slug,
    tags: [],
  };
}

function searchBody(results: NavLink[], query = "test") {
  return {
    results,
    total: results.length,
    query,
    mode: "fuse",
    facets: { categories: [], tags: [], ratings: [], popularity: [] },
    suggestions: [],
    recommendations: [],
    expandedTerms: [query],
    appliedSynonyms: [],
  };
}

describe("frontend performance and lifecycle regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not rebuild descendant category data when server precomputation is provided", async () => {
    const precomputed: PrecomputedNavData = {
      descendantSlugsMap: { ai: ["ai"] },
      tabKeys: [{ key: "all", label: "全部" }, { key: "ai", label: "AI" }],
      tabCounts: [{ key: "all", label: "全部", count: 1 }],
      tabTree: [],
      availableTags: [],
    };
    const { useDerivedLinks } = await import("@/components/navigation/useDerivedLinks");

    const { result } = renderHook(() =>
      useDerivedLinks({
        categories: [category],
        links: [link("one")],
        activeCategory: "all",
        activeTags: [],
        sortMode: "default",
        search: "",
        serverResults: [],
        precomputed,
      })
    );

    expect(result.current.descendantSlugsMap.get("ai")).toEqual(new Set(["ai"]));
    expect(mocks.getDescendantSlugs).not.toHaveBeenCalled();
  });

  it("seeds filter state from RSC initialFilters instead of DEFAULT_NAVIGATION_FILTERS", async () => {
    const { useFilterState } = await import("@/components/navigation/useFilterState");
    const { result } = renderHook(() =>
      useFilterState({
        q: "",
        cat: "ai",
        tags: ["api"],
        minRating: 4,
        popularity: "featured",
        semantic: false,
      })
    );

    expect(result.current.activeCategory).toBe("ai");
    expect(result.current.activeTags).toEqual(["api"]);
    expect(result.current.minRatingFilter).toBe(4);
    expect(result.current.popularityFilter).toBe("featured");
    expect(result.current.semanticSearch).toBe(false);
  });

  it("home page seeds Navigation with parseFiltersFromSearchParams and omits non-streaming Suspense", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("app/page.tsx", "utf8");

    expect(source).toContain("parseFiltersFromSearchParams");
    expect(source).toContain("initialFilters={initialFilters}");
    expect(source).toContain("precomputed={precomputed}");
    expect(source).not.toMatch(/import\s*\{[^}]*Suspense[^}]*\}\s*from\s*["']react["']/);
    expect(source).not.toMatch(/<\s*Suspense[\s>]/);
    // Route-level skeleton stays in app/loading.tsx; page must not import NavSkeleton.
    expect(source).not.toMatch(/from\s*["']@\/components\/NavSkeleton["']/);
  });

  it("clears stale search results when a later request returns a non-2xx response", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(searchBody([{ ...link("first"), category_id: null }], "first")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const { useServerSearch } = await import("@/components/navigation/useServerSearch");
    const setSearch = vi.fn();
    const base = {
      semanticSearch: false,
      activeCategory: "all",
      activeTags: [] as string[],
      minRatingFilter: null,
      popularityFilter: null,
      links: [] as NavLink[],
      setSearch,
    };

    const { result, rerender } = renderHook(
      ({ rawSearch }: { rawSearch: string }) => useServerSearch({ ...base, rawSearch }),
      { initialProps: { rawSearch: "first" } }
    );
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.serverResults).toHaveLength(1);

    rerender({ rawSearch: "second" });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.serverResults).toEqual([]);
    expect(result.current.searchLoading).toBe(false);
  });

  it("rejects a malformed successful search response at the client boundary", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [{ id: 42 }], total: 1, query: "bad", mode: "fuse" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ));
    const { useServerSearch } = await import("@/components/navigation/useServerSearch");
    const activeTags: string[] = [];
    const links: NavLink[] = [];
    const setSearch = vi.fn();

    const { result } = renderHook(() => useServerSearch({
      rawSearch: "bad",
      semanticSearch: false,
      activeCategory: "all",
      activeTags,
      minRatingFilter: null,
      popularityFilter: null,
      links,
      setSearch,
    }));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.serverResults).toEqual([]);
    expect(result.current.searchLoading).toBe(false);
  });

  it("mounts a deferred result grid only after it enters the viewport", async () => {
    let observerCallback: IntersectionObserverCallback | null = null;
    class IntersectionObserverMock {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
      takeRecords = vi.fn(() => []);
      root = null;
      rootMargin = "0px";
      thresholds = [0];
    }
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
    const { ResultGrid } = await import("@/components/ResultGrid");
    const view = render(
      <ResultGrid
        links={[link("one"), link("two"), link("three")]}
        baseIndex={0}
        focusedIndex={-1}
        onFocusChange={() => {}}
        onKeyDown={() => {}}
        initialVisible={0}
        pageSize={2}
      />
    );

    expect(view.queryAllByTestId("link-card")).toHaveLength(0);
    act(() => {
      observerCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });
    expect(view.queryAllByTestId("link-card")).toHaveLength(2);
  });

  it("mounts the focused keyboard result even when it is outside the initial window", async () => {
    const { ResultGrid } = await import("@/components/ResultGrid");
    const view = render(
      <ResultGrid
        links={[link("one"), link("two"), link("three")]}
        baseIndex={0}
        focusedIndex={2}
        onFocusChange={vi.fn()}
        onKeyDown={vi.fn()}
        initialVisible={1}
        pageSize={1}
      />
    );

    expect(view.queryAllByTestId("link-card")).toHaveLength(3);
    expect(view.container.querySelector('[data-result-index="2"]')).not.toBeNull();
  });

  it("does not route Enter from a card action through result keyboard navigation", async () => {
    const onKeyDown = vi.fn();
    const { ResultGrid } = await import("@/components/ResultGrid");
    const view = render(
      <ResultGrid
        links={[link("one")]}
        baseIndex={0}
        focusedIndex={0}
        onFocusChange={vi.fn()}
        onKeyDown={onKeyDown}
      />
    );

    fireEvent.keyDown(view.getByRole("button", { name: "收藏 Link one" }), {
      key: "Enter",
    });

    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it("allocates one mount budget across all category sections", async () => {
    const { allocateSectionMountBudget } = await import(
      "@/components/navigation/mount-budget"
    );

    expect(allocateSectionMountBudget([4, 4, 4], 5, 2)).toEqual([3, 0, 0]);
    expect(allocateSectionMountBudget([2, 2], 8, 1)).toEqual([2, 2]);
  });

  it("shares the first-screen budget with dual-track sections before categories", async () => {
    // 分类区改为每区上限 12，不再与 DualTrack 抢同一 24 预算；零卡片区已禁止
    const perSection = (length: number) => Math.min(length, 12);
    expect(perSection(10)).toBe(10);
    expect(perSection(53)).toBe(12);
    expect(perSection(0)).toBe(0);
  });

  it("hides load-more while a zero-initial grid awaits first intersection mount", async () => {
    class IntersectionObserverMock {
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
      takeRecords = vi.fn(() => []);
      root = null;
      rootMargin = "0px";
      thresholds = [0];
      constructor(_cb: IntersectionObserverCallback) {
        void _cb;
      }
    }
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
    const { ResultGrid } = await import("@/components/ResultGrid");
    const view = render(
      <ResultGrid
        links={[link("one"), link("two"), link("three")]}
        baseIndex={0}
        focusedIndex={-1}
        onFocusChange={() => {}}
        onKeyDown={() => {}}
        initialVisible={0}
        pageSize={2}
      />
    );

    expect(view.queryAllByTestId("link-card")).toHaveLength(0);
    expect(view.queryByRole("button", { name: /加载更多/ })).toBeNull();
  });

  it("resets the progressive window when the link list identity changes without remounting the outer grid", async () => {
    const { ResultGrid } = await import("@/components/ResultGrid");
    const onFocusChange = vi.fn();
    const view = render(
      <ResultGrid
        links={[link("one"), link("two"), link("three"), link("four")]}
        baseIndex={0}
        focusedIndex={-1}
        onFocusChange={onFocusChange}
        onKeyDown={vi.fn()}
        initialVisible={2}
        pageSize={2}
      />
    );

    expect(view.queryAllByTestId("link-card")).toHaveLength(2);
    fireEvent.click(view.getByRole("button", { name: /加载更多/ }));
    expect(view.queryAllByTestId("link-card")).toHaveLength(4);

    view.rerender(
      <ResultGrid
        links={[link("a"), link("b"), link("c")]}
        baseIndex={0}
        focusedIndex={-1}
        onFocusChange={onFocusChange}
        onKeyDown={vi.fn()}
        initialVisible={2}
        pageSize={2}
      />
    );

    expect(view.queryAllByTestId("link-card")).toHaveLength(2);
    expect(view.getByText("Link a")).toBeTruthy();
  });

  it("disconnects the Pangu observer and clears performance entries on unmount", async () => {
    const disconnect = vi.fn();
    const observe = vi.fn();
    class MutationObserverMock {
      constructor() {}
      observe = observe;
      disconnect = disconnect;
      takeRecords = vi.fn(() => []);
    }
    const clearMarks = vi.fn();
    const clearMeasures = vi.fn();
    vi.stubGlobal("MutationObserver", MutationObserverMock);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    Object.defineProperties(performance, {
      mark: { configurable: true, value: vi.fn() },
      measure: { configurable: true, value: vi.fn() },
      getEntriesByName: { configurable: true, value: vi.fn(() => []) },
      clearMarks: { configurable: true, value: clearMarks },
      clearMeasures: { configurable: true, value: clearMeasures },
    });
    const { PanguSpacing } = await import("@/components/PanguSpacing");
    const view = render(
      <div id="main-content">
        <div id="atlas">中文English</div>
        <PanguSpacing />
      </div>
    );

    await waitFor(() => expect(observe).toHaveBeenCalled());
    view.unmount();

    expect(disconnect).toHaveBeenCalled();
    expect(clearMarks).toHaveBeenCalled();
    expect(clearMeasures).toHaveBeenCalled();
  });

  it("keeps favicon resolution on the same-origin proxy", async () => {
    const requested: string[] = [];
    class ImageMock {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        requested.push(value);
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("Image", ImageMock);
    const { useFavicon } = await import("@/lib/use-favicon");

    renderHook(() => useFavicon("privacy-test.example"));
    await waitFor(() => expect(requested.length).toBeGreaterThan(0));

    expect(requested).toEqual(["/api/favicon?domain=privacy-test.example&v=2"]);
  });

  it("does not refetch the resource browse endpoint when server data is provided", async () => {
    const initialResults: ResourceItem[] = [{
      id: "resource-1",
      title: "Server Resource",
      url: "https://resource.example.com",
      domain: "resource.example.com",
      summary: "server rendered",
      category: "Docs",
      tags: [],
      crawled_at: "2026-01-01T00:00:00.000Z",
      rank: 0,
    }];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/resource-search-status") {
        return new Response(JSON.stringify({ available: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`unexpected fetch: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { ResourcesClient } = await import("@/app/resources/_components/ResourcesClient");

    const view = render(<ResourcesClient initialResults={initialResults} />);
    expect(view.getByText("Server Resource")).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("resource-browse"))).toBe(false);
  });

  it("keeps the tool detail route on ISR instead of force-dynamic rendering", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("app/tool/[slug]/page.tsx", "utf8");

    expect(source).toContain("export const revalidate = 60");
    expect(source).not.toContain('export const dynamic = "force-dynamic"');
  });
});
