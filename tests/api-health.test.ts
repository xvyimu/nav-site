import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const supabaseSelect = vi.fn();
const loggerWarn = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      select: supabaseSelect,
    })),
  })),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: loggerWarn,
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("/api/health", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    delete process.env.EMBED_SERVER_URL;
    supabaseSelect.mockResolvedValue({ count: 3, error: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.EMBED_SERVER_URL;
  });

  it("reports embedding health when the local embed service is reachable", async () => {
    process.env.EMBED_SERVER_URL = "http://127.0.0.1:8003";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
      }))
    );

    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.checks.database.status).toBe("ok");
    expect(body.checks.embedding.status).toBe("ok");
    expect(body.checks.embedding.detail).toBe("optional embed service reachable");
  });

  it("keeps the app healthy but marks embedding as error when the embed service is down", async () => {
    process.env.EMBED_SERVER_URL = "http://127.0.0.1:8003";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
      }))
    );

    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.checks.embedding.status).toBe("error");
    expect(body.checks.embedding.detail).toBe("optional embed service returned 503; semantic search will fall back");
    expect(loggerWarn).not.toHaveBeenCalled();
  });

  it("skips embedding health when EMBED_SERVER_URL is not configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.checks.embedding.status).toBe("skipped");
    expect(body.checks.embedding.detail).toBe("not configured or non-loopback EMBED_SERVER_URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips embedding health for non-loopback embed URLs", async () => {
    process.env.EMBED_SERVER_URL = "https://embeddings.example.com";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.checks.embedding.status).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows IPv6 loopback embed URLs", async () => {
    process.env.EMBED_SERVER_URL = "http://[::1]:8003";
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.checks.embedding.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledWith("http://[::1]:8003/health", expect.any(Object));
  });
});
