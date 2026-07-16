import { describe, expect, it, vi } from "vitest";

type ProbeModule = typeof import("../scripts/probe-production.mjs");

async function importProbeModule(): Promise<ProbeModule> {
  return import("../scripts/probe-production.mjs");
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function textResponse(
  body: string,
  contentType: string,
  status = 200,
  headers: HeadersInit = {}
): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": contentType,
      ...headers,
    },
  });
}

function makeFetch(fixtures: Record<string, Response>) {
  return vi.fn(async (input: URL | RequestInfo) => {
    const raw = input.toString();
    const exact = fixtures[raw];
    if (exact) return exact.clone();

    // Support cache-busted probe URLs (e.g. /api/health?_probe=... or existing query + _probe).
    try {
      const url = new URL(raw);
      url.searchParams.delete("_probe");
      const withoutProbe = url.toString().replace(/\?$/, "");
      if (fixtures[withoutProbe]) return fixtures[withoutProbe].clone();

      // Match fixture keys that already include a query string by pathname+original params minus _probe.
      for (const [key, response] of Object.entries(fixtures)) {
        try {
          const fixtureUrl = new URL(key);
          if (fixtureUrl.origin !== url.origin || fixtureUrl.pathname !== url.pathname) continue;
          const fixtureParams = new URLSearchParams(fixtureUrl.search);
          const actualParams = new URLSearchParams(url.search);
          actualParams.delete("_probe");
          let matches = true;
          for (const [k, v] of fixtureParams.entries()) {
            if (actualParams.get(k) !== v) {
              matches = false;
              break;
            }
          }
          if (matches) return response.clone();
        } catch {
          // ignore invalid fixture keys
        }
      }
    } catch {
      // ignore invalid URLs and fall through to 404
    }

    return textResponse("not found", "text/plain", 404);
  }) as unknown as typeof fetch;
}

describe("scripts/probe-production", () => {
  it("builds endpoint URLs from the configured production base URL", async () => {
    const { makeProbeUrl } = await importProbeModule();

    expect(makeProbeUrl("https://example.com", "/api/health")).toBe("https://example.com/api/health");
    expect(makeProbeUrl("https://example.com/", "api/search?q=ai")).toBe("https://example.com/api/search?q=ai");
    expect(makeProbeUrl("https://example.com", "/build-info.json", { cacheBust: true })).toMatch(
      /^https:\/\/example\.com\/build-info\.json\?_probe=[a-z0-9]+$/i
    );
  });

  it("passes the production smoke endpoints when responses are healthy", async () => {
    const { runProductionProbe, assertProbePassed } = await importProbeModule();
    const baseUrl = "https://nav-site.example";
    const fetchImpl = makeFetch({
      [`${baseUrl}/`]: textResponse("<html></html>", "text/html; charset=utf-8"),
      [`${baseUrl}/api/health`]: jsonResponse(
        {
          status: "healthy",
          version: {
            commit: "65031ff027e610e7734da2b5d8c82e708144cdd7",
          },
          checks: {
            database: { status: "ok" },
            env: { status: "ok" },
            embedding: { status: "skipped" },
            resourceLibrarySearch: { status: "skipped" },
          },
        },
        200,
        { "cache-control": "no-store" }
      ),
      [`${baseUrl}/api/search?q=ai&limit=5`]: jsonResponse(
        {
          results: [{ id: "550e8400-e29b-41d4-a716-446655440000" }],
          total: 1,
          mode: "fuse",
        },
        200,
        { "cache-control": "no-store" }
      ),
      [`${baseUrl}/tool/figma`]: textResponse("<html></html>", "text/html; charset=utf-8"),
      [`${baseUrl}/sitemap.xml`]: textResponse(
        `<urlset><url><loc>${baseUrl}/tool/figma</loc></url></urlset>`,
        "application/xml"
      ),
      [`${baseUrl}/robots.txt`]: textResponse("User-agent: *", "text/plain"),
      [`${baseUrl}/build-info.json`]: jsonResponse({
        commit: "65031ff027e610e7734da2b5d8c82e708144cdd7",
      }),
    });

    const results = await runProductionProbe({
      config: {
        baseUrl,
        timeoutMs: 1000,
        expectEmbeddingSkipped: true,
        requireEmbedding: false,
        expectedCommit: "65031ff0",
        retries: 1,
        retryDelayMs: 1,
      },
      fetchImpl,
      waitImpl: async () => {},
    });

    expect(results.every((result) => result.ok)).toBe(true);
    expect(() => assertProbePassed(results)).not.toThrow();
  });

  it("rejects false-green search and sitemap payloads without production data", async () => {
    const { validateSearchPayload, validateSitemapPayload } = await importProbeModule();

    expect(validateSearchPayload({ results: [], total: 0, mode: "fuse" })).toContain(
      "expected at least one production search result"
    );
    expect(validateSitemapPayload("<urlset></urlset>")).toContain(
      "expected sitemap to include at least one tool URL"
    );
  });

  it("enforces no-store on dynamic health and search responses", async () => {
    const { runProductionProbe } = await importProbeModule();
    const baseUrl = "https://nav-site.example";
    const fetchImpl = makeFetch({
      [`${baseUrl}/api/search?q=ai&limit=5`]: jsonResponse({
        results: [{ id: "550e8400-e29b-41d4-a716-446655440000" }],
        total: 1,
        mode: "fuse",
      }),
    });

    const results = await runProductionProbe({
      config: {
        baseUrl,
        timeoutMs: 1000,
        expectEmbeddingSkipped: false,
        requireEmbedding: false,
        expectedCommit: "",
        retries: 0,
        retryDelayMs: 1,
      },
      endpoints: [{
        name: "search",
        path: "/api/search?q=ai&limit=5",
        contentType: /application\/json/i,
        json: "search",
        requireNoStore: true,
      }],
      fetchImpl,
    });

    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.detail).toContain("unexpected cache-control");
  });

  it("accepts CDN no-store when Cache-Control is rewritten by the edge", async () => {
    const { runProductionProbe } = await importProbeModule();
    const baseUrl = "https://nav-site.example";
    const fetchImpl = makeFetch({
      [`${baseUrl}/api/health`]: jsonResponse(
        {
          status: "healthy",
          checks: {
            database: { status: "ok" },
            env: { status: "ok" },
            embedding: { status: "skipped" },
          },
        },
        200,
        {
          "cache-control": "max-age=14400, must-revalidate",
          "cdn-cache-control": "no-store",
        }
      ),
    });

    const results = await runProductionProbe({
      config: {
        baseUrl,
        timeoutMs: 1000,
        expectEmbeddingSkipped: true,
        requireEmbedding: false,
        expectedCommit: "",
        retries: 0,
        retryDelayMs: 1,
      },
      endpoints: [{
        name: "health",
        path: "/api/health",
        contentType: /application\/json/i,
        json: "health",
        requireNoStore: true,
      }],
      fetchImpl,
    });

    expect(results[0]?.ok).toBe(true);
  });

  it("flags an old deployment when latest health semantics are expected", async () => {
    const { runProductionProbe, assertProbePassed } = await importProbeModule();
    const baseUrl = "https://nav-site.example";
    const fetchImpl = makeFetch({
      [`${baseUrl}/api/health`]: jsonResponse({
        status: "healthy",
        checks: {
          database: { status: "ok" },
          env: { status: "ok" },
          embedding: { status: "error" },
        },
      }),
    });

    const results = await runProductionProbe({
      config: {
        baseUrl,
        timeoutMs: 1000,
        expectEmbeddingSkipped: true,
        requireEmbedding: false,
        expectedCommit: "",
        retries: 1,
        retryDelayMs: 1,
      },
      endpoints: [{ name: "health", path: "/api/health", contentType: /application\/json/i, json: "health", cacheControl: /no-store/ }],
      fetchImpl,
      waitImpl: async () => {},
    });

    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.detail).toContain("expected embedding check skipped");
    expect(() => assertProbePassed(results)).toThrow("Production probe failed");
  });

  it("flags resource library search health errors when the latest health payload reports them", async () => {
    const { runProductionProbe, assertProbePassed } = await importProbeModule();
    const baseUrl = "https://nav-site.example";
    const fetchImpl = makeFetch({
      [`${baseUrl}/api/health`]: jsonResponse({
        status: "healthy",
        checks: {
          database: { status: "ok" },
          env: { status: "ok" },
          embedding: { status: "skipped" },
          resourceLibrarySearch: { status: "error" },
        },
      }),
    });

    const results = await runProductionProbe({
      config: {
        baseUrl,
        timeoutMs: 1000,
        expectEmbeddingSkipped: true,
        requireEmbedding: false,
        expectedCommit: "",
        retries: 1,
        retryDelayMs: 1,
      },
      endpoints: [{ name: "health", path: "/api/health", contentType: /application\/json/i, json: "health", cacheControl: /no-store/ }],
      fetchImpl,
      waitImpl: async () => {},
    });

    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.detail).toContain("expected resource library search check ok or skipped");
    expect(() => assertProbePassed(results)).toThrow("Production probe failed");
  });

  it("flags a deployed commit mismatch when a release commit is expected", async () => {
    const { runProductionProbe, assertProbePassed } = await importProbeModule();
    const baseUrl = "https://nav-site.example";
    const fetchImpl = makeFetch({
      [`${baseUrl}/api/health`]: jsonResponse({
        status: "healthy",
        version: {
          commit: "old-commit",
        },
        checks: {
          database: { status: "ok" },
          env: { status: "ok" },
          embedding: { status: "skipped" },
        },
      }),
      [`${baseUrl}/build-info.json`]: jsonResponse({
        commit: "old-commit",
      }),
    });

    const results = await runProductionProbe({
      config: {
        baseUrl,
        timeoutMs: 1000,
        expectEmbeddingSkipped: true,
        requireEmbedding: false,
        expectedCommit: "65031ff027e610e7734da2b5d8c82e708144cdd7",
        retries: 1,
        retryDelayMs: 1,
      },
      endpoints: [{ name: "health", path: "/api/health", contentType: /application\/json/i, json: "health", cacheControl: /no-store/ }],
      fetchImpl,
      waitImpl: async () => {},
    });

    expect(results.some((result) => result.name === "build-info" && !result.ok)).toBe(true);
    expect(results.find((result) => result.name === "build-info")?.detail).toContain("expected build commit");
    expect(() => assertProbePassed(results)).toThrow("Production probe failed");
  });

  it("reads CLI and environment configuration without requiring secrets", async () => {
    const { readConfigFromEnv } = await importProbeModule();

    expect(
      readConfigFromEnv(
        {
          PRODUCTION_BASE_URL: "https://env.example",
          PRODUCTION_PROBE_TIMEOUT_MS: "5000",
          PRODUCTION_EXPECT_EMBEDDING_SKIPPED: "true",
          PRODUCTION_EXPECT_COMMIT: "env-sha",
          PRODUCTION_PROBE_RETRIES: "3",
          PRODUCTION_PROBE_RETRY_DELAY_MS: "25",
        } as unknown as NodeJS.ProcessEnv,
        ["--base-url", "https://cli.example", "--timeout-ms=7000"]
      )
    ).toEqual({
      baseUrl: "https://cli.example",
      timeoutMs: 7000,
      expectEmbeddingSkipped: true,
      requireEmbedding: false,
      expectedCommit: "env-sha",
      retries: 3,
      retryDelayMs: 25,
    });
  });

  it("resolves explicit HTTPS_PROXY before Windows registry lookup", async () => {
    const { resolveSystemProxyUrl } = await importProbeModule();

    expect(
      resolveSystemProxyUrl({
        HTTPS_PROXY: "http://127.0.0.1:7890",
        PROBE_NO_PROXY: "",
      } as unknown as NodeJS.ProcessEnv)
    ).toBe("http://127.0.0.1:7890");

    expect(
      resolveSystemProxyUrl({
        HTTPS_PROXY: "127.0.0.1:7890",
      } as unknown as NodeJS.ProcessEnv)
    ).toBe("http://127.0.0.1:7890");

    expect(
      resolveSystemProxyUrl({
        HTTPS_PROXY: "http://127.0.0.1:7890",
        PROBE_NO_PROXY: "1",
      } as unknown as NodeJS.ProcessEnv)
    ).toBeNull();
  });

  it("retries transient network failures without hiding persistent semantic failures", async () => {
    const { runProductionProbe, assertProbePassed } = await importProbeModule();
    const baseUrl = "https://nav-site.example";
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce(textResponse("<html></html>", "text/html; charset=utf-8")) as unknown as typeof fetch;

    const results = await runProductionProbe({
      config: {
        baseUrl,
        timeoutMs: 1000,
        expectEmbeddingSkipped: false,
        requireEmbedding: false,
        expectedCommit: "",
        retries: 1,
        retryDelayMs: 1,
      },
      endpoints: [{ name: "home", path: "/", contentType: /text\/html/i }],
      fetchImpl,
      waitImpl: async () => {},
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(results[0]).toMatchObject({ ok: true, attempts: 2 });
    expect(() => assertProbePassed(results)).not.toThrow();
  });

  it("does not retry old deployment build-info 404 responses as network failures", async () => {
    const { runProductionProbe } = await importProbeModule();
    const baseUrl = "https://nav-site.example";
    const fetchImpl = vi.fn(async () =>
      textResponse("<!doctype html><title>404</title>", "text/html; charset=utf-8", 404)
    ) as unknown as typeof fetch;

    const results = await runProductionProbe({
      config: {
        baseUrl,
        timeoutMs: 1000,
        expectEmbeddingSkipped: false,
        requireEmbedding: false,
        expectedCommit: "e26dab909d9936c08fc5163809dccf64cd4d0df3",
        retries: 3,
        retryDelayMs: 1,
      },
      endpoints: [],
      fetchImpl,
      waitImpl: async () => {},
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(results[0]).toMatchObject({ name: "build-info", status: 404, ok: false, attempts: 1 });
    expect(results[0]?.detail).toContain("HTTP 404");
    expect(results[0]?.detail).toContain("unexpected content-type");
    expect(results[0]?.detail).toContain("invalid JSON response");
  });
});
