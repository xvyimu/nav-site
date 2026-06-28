import { describe, expect, it } from "vitest";
import { buildSearchSuggestions } from "./search-experience";
import type { NavLink } from "./types";

function makeLink(overrides: Partial<NavLink> & { id: string; title: string }): NavLink {
  return {
    url: "https://example.com",
    description: null,
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

describe("search experience helpers", () => {
  it("offers popular local suggestions before a query is entered", () => {
    const suggestions = buildSearchSuggestions(
      "",
      [
        makeLink({ id: "l1", title: "OpenAI Platform", click_count: 12 }),
        makeLink({ id: "l2", title: "Cloud VPS", click_count: 4 }),
      ],
      {
        categories: [{ value: "ai-tools", label: "AI 工具", count: 3 }],
        tags: [{ value: "api", label: "API", count: 2 }],
        ratings: [],
        popularity: [],
      },
    );

    expect(suggestions).toEqual([
      { type: "tool", value: "OpenAI Platform", label: "OpenAI Platform" },
      { type: "tool", value: "Cloud VPS", label: "Cloud VPS" },
      { type: "category", value: "AI 工具", label: "AI 工具", count: 3 },
      { type: "tag", value: "API", label: "API", count: 2 },
    ]);
  });
});
