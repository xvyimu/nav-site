import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToolQuickView } from "./ToolQuickView";
import type { NavLink } from "@/lib/types";

vi.mock("@/components/FavoritesProvider", () => ({
  useFavoritesContext: () => ({
    isFavorite: () => false,
    toggleFavorite: vi.fn(),
  }),
}));

function makeLink(overrides: Partial<NavLink> = {}): NavLink {
  return {
    id: "figma-1",
    title: "Figma",
    url: "https://figma.com",
    description: "Collaborative design tool",
    icon: null,
    category_id: "design",
    category_name: "设计工具",
    approved: true,
    paid: false,
    featured: true,
    click_count: 42,
    avg_rating: 4.3,
    tags: [
      { id: "tag-design", name: "设计", slug: "design", created_at: "2026-01-01T00:00:00Z" },
      { id: "tag-collab", name: "协作", slug: "collab", created_at: "2026-01-01T00:00:00Z" },
    ],
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("ToolQuickView", () => {
  it("renders nothing when link is null", () => {
    const { container } = render(<ToolQuickView link={null} onClose={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders tool title and domain", () => {
    render(<ToolQuickView link={makeLink()} onClose={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Figma" })).toBeTruthy();
    expect(screen.getByText("figma.com")).toBeTruthy();
  });

  it("renders description when present", () => {
    render(<ToolQuickView link={makeLink()} onClose={vi.fn()} />);

    expect(screen.getByText("Collaborative design tool")).toBeTruthy();
  });

  it("renders fact grid with category, clicks, rating", () => {
    render(<ToolQuickView link={makeLink()} onClose={vi.fn()} />);

    expect(screen.getByText("设计工具")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    // 评分通过 aria-label 显示
    expect(screen.getByLabelText("评分 4.3 分")).toBeTruthy();
  });

  it("renders tags section when tags exist", () => {
    render(<ToolQuickView link={makeLink()} onClose={vi.fn()} />);

    expect(screen.getByText("设计")).toBeTruthy();
    expect(screen.getByText("协作")).toBeTruthy();
  });

  it("renders featured description for featured tool", () => {
    render(<ToolQuickView link={makeLink({ featured: true })} onClose={vi.fn()} />);

    expect(screen.getByText("该工具被标记为精选收录，出现在优先发现集中。")).toBeTruthy();
  });

  it("renders standard description for non-featured tool", () => {
    render(<ToolQuickView link={makeLink({ featured: false })} onClose={vi.fn()} />);

    expect(screen.getByText("该工具已通过审核纳入导航图谱，可直接从卡片或此预览打开访问。")).toBeTruthy();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<ToolQuickView link={makeLink()} onClose={onClose} />);

    // 有两个 aria-label="关闭工具预览" 的按钮（背板 + 实际关闭按钮），取第二个（实际关闭按钮）
    const closeBtns = screen.getAllByLabelText("关闭工具预览");
    fireEvent.click(closeBtns[1]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders searchMeta section when searchMeta is present", () => {
    render(
      <ToolQuickView
        link={makeLink({
          searchMeta: {
            query: "figma",
            expandedTerms: [],
            source: "hybrid",
            highlights: [{ field: "category", value: "design", label: "设计" }],
            explanation: {
              reason: "匹配设计工具分类",
              label: "语义搜索",
              matchedFields: ["category"],
            },
          },
        })}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("匹配解释")).toBeTruthy();
    expect(screen.getByText("匹配设计工具分类")).toBeTruthy();
    // searchMeta.highlights 中的"设计"与 tags 中的"设计"重复，用 getAllByText 确认至少有 2 个
    expect(screen.getAllByText("设计").length).toBeGreaterThanOrEqual(2);
  });

  it("sets role=\"dialog\" with aria-modal", () => {
    render(<ToolQuickView link={makeLink()} onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("renders open website button with external link", () => {
    render(<ToolQuickView link={makeLink()} onClose={vi.fn()} />);

    const openBtn = screen.getByText("打开网站");
    expect(openBtn).toBeTruthy();
    expect(openBtn.closest("a")?.getAttribute("href")).toBe("https://figma.com");
    expect(openBtn.closest("a")?.getAttribute("target")).toBe("_blank");
  });

  it("renders favorite button", () => {
    render(<ToolQuickView link={makeLink()} onClose={vi.fn()} />);

    expect(screen.getByText("收藏")).toBeTruthy();
  });
});