import { describe, expect, it, vi } from "vitest";

type ProbeModule = typeof import("../scripts/probe-production.mjs");

async function importProbeModule(): Promise<ProbeModule> {
  return import("../scripts/probe-production.mjs");
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function textResponse(body: string, contentType: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": contentType,
    },
  });
}

function makeFetch(fixtures: Record<string, Response>) {
  return vi.fn(async (input: URL | RequestInfo) => {
    const url = input.toString();
    const response = fixtures[url];
    if (!response) return textResponse("not found", "text/plain", 404);
    return response.clone();
  }) as unknown as typeof fetch;
}

describe("scripts/probe-production", () => {
  it("builds endpoint URLs from the configured production base URL", async () => {
    const { makeProbeUrl } = await importProbeModule();

    expect(makeProbeUrl("https://example.com", "/api/health")).toBe("https://example.com/api/health");
    expect(makeProbeUrl("https://example.com/", "api/search?q=ai")).toBe("https://example.com/api/search?q=ai");
  });

  it("passes the production smoke endpoints when responses are healthy", async () => {
    const { runProductionProbe, assertProbePassed } = await importProbeModule();
    const baseUrl = "https://nav-site.example";
    const fetchImpl = makeFetch({
      [`${baseUrl}/`]: textResponse("<html></html>", "text/html; charset=utf-8"),
      [`${baseUrl}/api/health`]: jsonResponse({
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
      }),
      [`${baseUrl}/api/search?q=ai&limit=5`]: jsonResponse({
        results: [],
        total: 0,
        mode: "fuse",
      }),
      [`${baseUrl}/tool/figma`]: textResponse("<html></html>", "text/html; charset=utf-8"),
      [`${baseUrl}/sitemap.xml`]: textResponse("<urlset></urlset>", "application/xml"),
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
        expectedCommit: "",
        retries: 1,
        retryDelayMs: 1,
      },
      endpoints: [{ name: "health", path: "/api/health", contentType: /application\/json/i, json: "health" }],
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
        expectedCommit: "",
        retries: 1,
        retryDelayMs: 1,
      },
      endpoints: [{ name: "health", path: "/api/health", contentType: /application\/json/i, json: "health" }],
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
        expectedCommit: "65031ff027e610e7734da2b5d8c82e708144cdd7",
        retries: 1,
        retryDelayMs: 1,
      },
      endpoints: [{ name: "health", path: "/api/health", contentType: /application\/json/i, json: "health" }],
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
