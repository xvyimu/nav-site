import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CategorySection } from "./CategorySection";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { NavLink } from "@/lib/types";

vi.mock("@/components/FavoritesProvider", () => ({
  useFavoritesContext: () => ({
    favorites: new Set<string>(),
    isFavorite: () => false,
    toggleFavorite: vi.fn(),
    clearFavorites: vi.fn(),
    count: 0,
    mounted: true,
    isAuthenticated: false,
    favoriteIds: [],
  }),
  useFavoritesState: () => ({
    favorites: new Set<string>(),
    isFavorite: () => false,
    count: 0,
    mounted: true,
    isAuthenticated: false,
    favoriteIds: [],
  }),
  useFavoritesActions: () => ({
    toggleFavorite: vi.fn(),
    clearFavorites: vi.fn(),
  }),
}));

function makeLink(overrides: Partial<NavLink> & { id: string; title: string }): NavLink {
  return {
    url: "https://example.com",
    description: "Search result",
    icon: null,
    category_id: null,
    approved: true,
    paid: false,
    featured: false,
    click_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("CategorySection", () => {
  it("renders search results while a specific category facet is active", () => {
    render(
      <TooltipProvider>
        <CategorySection
          section={{
            key: "search-results",
            label: "搜索结果 (1)",
            accent: "",
            links: [makeLink({ id: "l1", title: "Cloud VPS", category_slug: "cloud-vps" })],
          }}
          sectionOffset={0}
          activeCategory="cloud-vps"
          focusedIndex={-1}
          onFocusChange={vi.fn()}
          onKeyDown={vi.fn()}
          searchQuery="server"
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("搜索结果 (1)")).toBeTruthy();
    expect(screen.getByText("Cloud VPS")).toBeTruthy();
  });
});
