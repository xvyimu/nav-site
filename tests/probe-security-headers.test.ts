import { describe, expect, it, vi } from "vitest";

type ProbeModule = typeof import("../scripts/probe-security-headers.mjs");

async function importProbeModule(): Promise<ProbeModule> {
  return import("../scripts/probe-security-headers.mjs");
}

function headerResponse(
  status: number,
  headers: Record<string, string>
): Response {
  return new Response("<html></html>", {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...headers,
    },
  });
}

describe("scripts/probe-security-headers", () => {
  it("defaults BASE to localhost and blocks production host without allow flag", async () => {
    const {
      readConfig,
      evaluateBaseUrl,
      DEFAULT_BASE_URL,
      BLOCKED_PRODUCTION_HOSTS,
    } = await importProbeModule();

    const config = readConfig([], {});
    expect(config.help).toBe(false);
    expect(config.baseUrl).toBe(DEFAULT_BASE_URL);
    expect(config.allowProduction).toBe(false);

    const blocked = evaluateBaseUrl("https://yuanjia1314.ccwu.cc/");
    expect(blocked.blocked).toBe(true);
    expect(blocked.host).toBe("yuanjia1314.ccwu.cc");
    expect(blocked.reason).toMatch(/production custom domain/i);

    const allowed = evaluateBaseUrl("https://yuanjia1314.ccwu.cc/", {
      allowProduction: true,
    });
    expect(allowed.blocked).toBe(false);

    const preview = evaluateBaseUrl("https://nav-site-git-x.vercel.app");
    expect(preview.blocked).toBe(false);

    expect(BLOCKED_PRODUCTION_HOSTS.has("yuanjia1314.ccwu.cc")).toBe(true);
  });

  it("reads --base-url / --allow-production / env overrides", async () => {
    const { readConfig } = await importProbeModule();

    const fromArgs = readConfig(
      [
        "--base-url",
        "https://preview.example.vercel.app",
        "--path",
        "/tool/figma",
        "--allow-production",
        "--compare-repo",
        "--json",
      ],
      {}
    );
    expect(fromArgs.baseUrl).toBe("https://preview.example.vercel.app");
    expect(fromArgs.path).toBe("/tool/figma");
    expect(fromArgs.allowProduction).toBe(true);
    expect(fromArgs.compareRepo).toBe(true);
    expect(fromArgs.json).toBe(true);

    const fromEnv = readConfig([], {
      HEADERS_PROBE_BASE_URL: "http://127.0.0.1:4000",
      HEADERS_PROBE_ALLOW_PRODUCTION: "1",
    });
    expect(fromEnv.baseUrl).toBe("http://127.0.0.1:4000");
    expect(fromEnv.allowProduction).toBe(true);
  });

  it("picks security headers and compares repo contract drift", async () => {
    const { pickSecurityHeaders, compareToRepoContract } =
      await importProbeModule();

    const live = pickSecurityHeaders(
      new Headers({
        "X-Frame-Options": "SAMEORIGIN",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "same-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "Content-Security-Policy": "default-src 'self'",
        "Server": "vercel",
      })
    );

    expect(live["x-frame-options"]).toBe("SAMEORIGIN");
    expect(live["referrer-policy"]).toBe("same-origin");
    expect(live["content-security-policy"]).toBe("default-src 'self'");
    expect(live.server).toBeUndefined();

    const rows = compareToRepoContract(live);
    const xfo = rows.find((r) => r.header === "x-frame-options");
    const xcto = rows.find((r) => r.header === "x-content-type-options");
    expect(xfo?.match).toBe(false);
    expect(xcto?.match).toBe(true);
  });

  it("probes a mock origin and returns key headers", async () => {
    const { probeSecurityHeaders } = await importProbeModule();
    const baseUrl = "https://preview.example.vercel.app";
    const fetchImpl = vi.fn(async () =>
      headerResponse(200, {
        "x-frame-options": "DENY",
        "x-content-type-options": "nosniff",
        "referrer-policy": "strict-origin-when-cross-origin",
        "permissions-policy": "camera=(), microphone=(), geolocation=()",
        "strict-transport-security":
          "max-age=31536000; includeSubDomains; preload",
        "content-security-policy": "default-src 'self'",
      })
    ) as unknown as typeof fetch;

    const result = await probeSecurityHeaders({
      baseUrl,
      fetchImpl,
      compareRepo: true,
    });

    expect(result.ok).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.status).toBe(200);
    expect(result.headers["x-frame-options"]).toBe("DENY");
    expect(result.compare.every((row) => row.match)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("refuses production BASE without --allow-production even if fetch would work", async () => {
    const { probeSecurityHeaders } = await importProbeModule();
    const fetchImpl = vi.fn() as unknown as typeof fetch;

    const result = await probeSecurityHeaders({
      baseUrl: "https://yuanjia1314.ccwu.cc",
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("main exits 1 when production BASE is blocked", async () => {
    const { main } = await importProbeModule();
    const exit = await main(
      ["--base-url", "https://yuanjia1314.ccwu.cc", "--json"],
      {}
    );
    expect(exit).toBe(1);
  });
});
