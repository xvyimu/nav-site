import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LinkCard } from "./LinkCard";
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
  useFavoriteMembership: () => false,
}));

function makeLink(overrides: Partial<NavLink> = {}): NavLink {
  return {
    id: "tool-1",
    title: "Figma",
    url: "https://figma.com",
    description: "Design collaboration",
    icon: null,
    category_id: null,
    approved: true,
    paid: false,
    featured: false,
    click_count: 7,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("LinkCard", () => {
  it("calls preview callback from the preview button", () => {
    const link = makeLink();
    const onPreview = vi.fn();

    renderWithProviders(<LinkCard link={link} onPreview={onPreview} />);

    fireEvent.click(screen.getByRole("button", { name: "预览 Figma" }));

    expect(onPreview).toHaveBeenCalledWith(link);
  });
});
