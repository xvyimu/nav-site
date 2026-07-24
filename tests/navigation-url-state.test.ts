import { describe, expect, it } from "vitest";
import {
  buildNavigationUrl,
  DEFAULT_NAVIGATION_FILTERS,
  parseFiltersFromSearchParams,
  parseFiltersFromUrl,
} from "@/lib/navigation/url-state";

describe("navigation url state", () => {
  it("parses query, category, tags, rating, popularity, and semantic mode", () => {
    const parsed = parseFiltersFromUrl(
      new URLSearchParams("q=chat&cat=ai-tools&tag=api,free&minRating=4&popularity=featured&semantic=false")
    );

    expect(parsed).toEqual({
      q: "chat",
      cat: "ai-tools",
      tags: ["api", "free"],
      minRating: 4,
      popularity: "featured",
      semantic: false,
    });
  });

  it("normalizes removed model-ranking category to all", () => {
    const parsed = parseFiltersFromUrl(new URLSearchParams("cat=model-ranking"));

    expect(parsed.cat).toBe("all");
  });

  it("drops invalid numeric and enum filters", () => {
    const parsed = parseFiltersFromUrl(
      new URLSearchParams("minRating=9&popularity=unknown")
    );

    expect(parsed.minRating).toBeNull();
    expect(parsed.popularity).toBeNull();
  });

  it("serializes compact URLs with semantic omitted when enabled", () => {
    const url = buildNavigationUrl({
      search: " chat ",
      activeCategory: "ai-tools",
      activeTags: ["api", "free"],
      minRatingFilter: 4,
      popularityFilter: "popular",
      semanticSearch: true,
    });

    expect(url).toBe("/?q=chat&cat=ai-tools&tag=api%2Cfree&minRating=4&popularity=popular");
  });

  it("serializes semantic=false only when disabled", () => {
    const url = buildNavigationUrl({
      search: "",
      activeCategory: "all",
      activeTags: [],
      minRatingFilter: null,
      popularityFilter: null,
      semanticSearch: false,
    });

    expect(url).toBe("/?semantic=false");
  });

  it("parseFiltersFromSearchParams accepts App Router record shape (RSC seed)", () => {
    const parsed = parseFiltersFromSearchParams({
      q: "  rust  ",
      cat: "ai",
      tag: ["api", "free"],
      minRating: "3",
      popularity: "popular",
      semantic: "false",
    });

    expect(parsed).toEqual({
      q: "rust",
      cat: "ai",
      tags: ["api", "free"],
      minRating: 3,
      popularity: "popular",
      semantic: false,
    });
  });

  it("parseFiltersFromSearchParams returns defaults for empty/null input", () => {
    expect(parseFiltersFromSearchParams(null)).toEqual(DEFAULT_NAVIGATION_FILTERS);
    expect(parseFiltersFromSearchParams(undefined)).toEqual(DEFAULT_NAVIGATION_FILTERS);
    expect(parseFiltersFromSearchParams({})).toEqual(DEFAULT_NAVIGATION_FILTERS);
  });

  it("parseFiltersFromSearchParams accepts URLSearchParams", () => {
    const parsed = parseFiltersFromSearchParams(
      new URLSearchParams("cat=cloud&tag=free")
    );
    expect(parsed.cat).toBe("cloud");
    expect(parsed.tags).toEqual(["free"]);
  });
});
