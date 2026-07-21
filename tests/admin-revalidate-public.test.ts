import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

describe("revalidatePublicNavContent", () => {
  beforeEach(() => {
    revalidatePath.mockClear();
  });

  it("revalidates home and sitemap by default", async () => {
    const { revalidatePublicNavContent } = await import("@/lib/admin/revalidate-public");
    revalidatePublicNavContent();
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/sitemap.xml");
  });

  it("also revalidates tool detail when slug is provided", async () => {
    vi.resetModules();
    const { revalidatePublicNavContent } = await import("@/lib/admin/revalidate-public");
    revalidatePublicNavContent({ slug: "chatgpt" });
    expect(revalidatePath).toHaveBeenCalledWith("/tool/chatgpt");
  });
});
