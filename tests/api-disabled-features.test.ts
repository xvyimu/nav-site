import { afterEach, describe, expect, it, vi } from "vitest";

async function importFresh<T>(path: string): Promise<T> {
  vi.resetModules();
  return import(path) as Promise<T>;
}

describe("disabled API feature flags", () => {
  afterEach(() => {
    delete process.env.ENABLE_PAYMENTS_API;
  });

  it.each([
    ["checkout", "@/app/api/checkout/route"],
    ["webhook", "@/app/api/webhook/route"],
  ])("returns 404 for the disabled %s endpoint", async (_name, path) => {
    delete process.env.ENABLE_PAYMENTS_API;
    const { POST } = await importFresh<{ POST: () => Promise<Response> }>(path);

    const response = await POST();

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
