import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToolQuickView } from "./ToolQuickView";
import type { NavLink } from "@/lib/types";

// 可变收藏状态：测试通过 favoriteIds 控制 isFavorite 返回值
const favoriteIds = new Set<string>();
const toggleFavoriteMock = vi.fn((id: string) => {
  if (favoriteIds.has(id)) favoriteIds.delete(id);
  else favoriteIds.add(id);
});

vi.mock("@/components/FavoritesProvider", () => ({
  useFavoritesContext: () => ({
    isFavorite: (id: string) => favoriteIds.has(id),
    toggleFavorite: toggleFavoriteMock,
  }),
  useFavoritesActions: () => ({
    toggleFavorite: toggleFavoriteMock,
    clearFavorites: vi.fn(),
  }),
  useFavoriteMembership: (id: string) => favoriteIds.has(id),
  useFavoritesState: () => ({
    favorites: favoriteIds,
    favoriteIds: [...favoriteIds],
    count: favoriteIds.size,
    mounted: true,
    isAuthenticated: false,
    isFavorite: (id: string) => favoriteIds.has(id),
  }),
}));

function makeLink(overrides: Partial<NavLink> = {}): NavLink {
  return {
    id: "figma-1",
    title: "Figma",
    url: "https://figma.com",
    description: "Collaborative design tool",
    icon: null,
    category_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
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
  beforeEach(() => {
    favoriteIds.clear();
    toggleFavoriteMock.mockClear();
  });

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

    fireEvent.click(screen.getByLabelText("关闭工具预览"));
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

  // ── 收藏切换 ──

  it("calls toggleFavorite with link id when favorite button clicked", () => {
    render(<ToolQuickView link={makeLink()} onClose={vi.fn()} />);

    const favBtn = screen.getByRole("button", { name: "收藏" });
    fireEvent.click(favBtn);

    expect(toggleFavoriteMock).toHaveBeenCalledTimes(1);
    expect(toggleFavoriteMock).toHaveBeenCalledWith("figma-1");
  });

  it("shows collected state when link is favorited", () => {
    favoriteIds.add("figma-1");
    render(<ToolQuickView link={makeLink()} onClose={vi.fn()} />);

    const favBtn = screen.getByRole("button", { name: "已收藏" });
    expect(favBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("shows uncollected state when link is not favorited", () => {
    render(<ToolQuickView link={makeLink()} onClose={vi.fn()} />);

    const favBtn = screen.getByRole("button", { name: "收藏" });
    expect(favBtn.getAttribute("aria-pressed")).toBe("false");
  });

  // ── 不安全 URL 兜底 ──

  it("renders href=# for unsafe url (javascript:)", () => {
    render(
      <ToolQuickView
        link={makeLink({ url: "javascript:alert(1)" })}
        onClose={vi.fn()}
      />,
    );

    const openLink = screen.getByText("打开网站").closest("a");
    expect(openLink?.getAttribute("href")).toBe("#");
  });

  // ── 空状态 ──

  it("omits description paragraph when description is null", () => {
    render(<ToolQuickView link={makeLink({ description: null })} onClose={vi.fn()} />);

    expect(screen.queryByText("Collaborative design tool")).toBeNull();
  });

  it("omits tags section when tags is empty", () => {
    render(<ToolQuickView link={makeLink({ tags: [] })} onClose={vi.fn()} />);

    // "标签"标题只在有 tags 时渲染
    expect(screen.queryByText("标签")).toBeNull();
  });

  it("shows 暂无 rating when avg_rating is undefined", () => {
    render(<ToolQuickView link={makeLink({ avg_rating: undefined })} onClose={vi.fn()} />);

    // rating 为 null 时显示"暂无"文本（Fact 渲染 <dt>{value}</dt>）
    expect(screen.getByText("暂无")).toBeTruthy();
    // 不渲染星星（aria-label 不存在）
    expect(screen.queryByLabelText(/评分/)).toBeNull();
  });
});