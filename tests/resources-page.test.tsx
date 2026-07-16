import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  browseResources: vi.fn(),
}));

vi.mock("@/lib/resource-library/browse", () => ({
  browseResources: mocks.browseResources,
}));

vi.mock("@/app/resources/_components/ResourcesClient", () => ({
  ResourcesClient: ({ initialResults }: { initialResults: Array<{ title: string }> }) => (
    <div>{initialResults.map((item) => item.title).join(",")}</div>
  ),
}));

describe("resources page server prefetch", () => {
  it("passes the server-side browse result into the client workspace", async () => {
    mocks.browseResources.mockResolvedValue({
      ok: true,
      results: [{ title: "Prefetched Resource" }],
    });
    const page = await import("@/app/resources/page");
    const server = await import("react-dom/server");

    const element = await page.default();
    const html = server.renderToStaticMarkup(element);

    expect(html).toContain("Prefetched Resource");
    expect(mocks.browseResources).toHaveBeenCalledWith({ limit: 80 });
  });
});
