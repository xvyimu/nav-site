import { describe, expect, it } from "vitest";
import {
  buildNavigationUrl,
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
});
