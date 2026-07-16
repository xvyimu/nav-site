import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

describe("resource-library client configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    mocks.createClient.mockReset();
  });

  it("falls back to the historical resource-library URL when no URL env is set", async () => {
    vi.stubEnv("RESOURCE_LIBRARY_SUPABASE_URL", "");
    vi.stubEnv("RESOURCE_LIBRARY_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    const { getResourceLibraryUrl } = await import("@/lib/resource-library/client");

    expect(getResourceLibraryUrl()).toBe("https://ihnmfsfbfnctgkhxmghk.supabase.co");
  });

  it("uses the anon key for production public reads and never falls back to service_role", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESOURCE_LIBRARY_ANON_KEY", "");
    vi.stubEnv("RESOURCE_LIBRARY_SERVICE_ROLE_KEY", "service-role-key");
    const { createResourceLibraryReadClient } = await import("@/lib/resource-library/client");

    expect(createResourceLibraryReadClient()).toBeNull();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
