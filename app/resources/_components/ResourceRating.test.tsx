import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ResourceRating } from "./ResourceRating";

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast,
}));

describe("ResourceRating", () => {
  beforeEach(() => {
    toast.success.mockReset();
    toast.error.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("refreshes and displays the server rating count after submit", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ count: 7 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ count: 8 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    render(<ResourceRating pageId="0194b64d-5cb6-7330-a273-1ab8f926e169" />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/resource-ratings?page_id=0194b64d-5cb6-7330-a273-1ab8f926e169",
        { cache: "no-store" }
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "5 星" }));

    await screen.findByText("已记录（当前 8 次评分）。");
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("感谢你的评分");
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/resource-ratings",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          page_id: "0194b64d-5cb6-7330-a273-1ab8f926e169",
          rating: 5,
        }),
      })
    );
  });

  it("does not invent a count when the stats endpoint is unavailable", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(new Response("{}", { status: 503 }));

    render(<ResourceRating pageId="0194b64d-5cb6-7330-a273-1ab8f926e169" />);

    fireEvent.click(screen.getByRole("button", { name: "4 星" }));

    await screen.findByText("已记录。");
    expect(screen.queryByText(/当前 \d+ 次评分/)).toBeNull();
  });

  it("loads sonner only when a toast is needed", () => {
    const source = readFileSync(join(process.cwd(), "app/resources/_components/ResourceRating.tsx"), "utf8");

    expect(source).not.toMatch(/import\s+\{\s*toast\s*\}\s+from\s+["']sonner["']/);
    expect(source).toContain('import("sonner")');
    expect(source).not.toMatch(/await\s+showToast\(/);
    expect(source).toContain('void import("sonner")');
  });
});
