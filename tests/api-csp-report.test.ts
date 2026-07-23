import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkDistributedRateLimit: vi.fn(),
  getClientIp: vi.fn(),
  loggerWarn: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("@/lib/rate-limit-distributed", () => ({
  checkDistributedRateLimit: mocks.checkDistributedRateLimit,
}));

vi.mock("@/lib/utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils")>("@/lib/utils");
  return {
    ...actual,
    getClientIp: mocks.getClientIp,
  };
});

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: mocks.loggerWarn,
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: mocks.captureMessage,
}));

async function importRoute() {
  vi.resetModules();
  return import("@/app/api/csp-report/route");
}

describe("POST /api/csp-report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClientIp.mockReturnValue("203.0.113.50");
    mocks.checkDistributedRateLimit.mockResolvedValue({ allowed: true, backend: "memory" });
  });

  it("returns 204 and does not log when rate limited", async () => {
    mocks.checkDistributedRateLimit.mockResolvedValue({ allowed: false, backend: "memory" });
    const { POST } = await importRoute();
    const response = await POST(
      new Request("http://localhost/api/csp-report", {
        method: "POST",
        headers: { "content-type": "application/csp-report" },
        body: JSON.stringify({
          "csp-report": {
            "violated-directive": "script-src",
            "blocked-uri": "inline",
          },
        }),
      })
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.loggerWarn).not.toHaveBeenCalled();
    expect(mocks.captureMessage).not.toHaveBeenCalled();
  });

  it("applies a 60s window with max 60 attempts (not swapped args)", async () => {
    const { POST } = await importRoute();
    await POST(
      new Request("http://localhost/api/csp-report", {
        method: "POST",
        headers: { "content-type": "application/csp-report" },
        body: JSON.stringify({
          "csp-report": {
            "violated-directive": "script-src",
            "blocked-uri": "inline",
          },
        }),
      })
    );

    expect(mocks.checkDistributedRateLimit).toHaveBeenCalledWith(
      "csp-report:203.0.113.50",
      60_000,
      60
    );
  });

  it("returns 204 for invalid JSON without throwing", async () => {
    const { POST } = await importRoute();
    const response = await POST(
      new Request("http://localhost/api/csp-report", {
        method: "POST",
        body: "not-json",
      })
    );
    expect(response.status).toBe(204);
    expect(mocks.loggerWarn).not.toHaveBeenCalled();
    expect(mocks.captureMessage).not.toHaveBeenCalled();
  });

  it("accepts a csp-report payload and may sample-log + Sentry", async () => {
    const { POST } = await importRoute();
    // Try a few payloads until one hits the sample bucket (hash % 20 === 0)
    let logged = false;
    for (let i = 0; i < 40; i += 1) {
      mocks.loggerWarn.mockClear();
      mocks.captureMessage.mockClear();
      const response = await POST(
        new Request("http://localhost/api/csp-report", {
          method: "POST",
          headers: { "content-type": "application/csp-report" },
          body: JSON.stringify({
            "csp-report": {
              "document-uri": "https://example.com/",
              "violated-directive": "script-src",
              "blocked-uri": `inline-${i}`,
            },
          }),
        })
      );
      expect(response.status).toBe(204);
      if (mocks.loggerWarn.mock.calls.length > 0) {
        logged = true;
        expect(mocks.loggerWarn).toHaveBeenCalledWith(
          "CSP report-only violation (sampled)",
          expect.objectContaining({
            source: "csp-report",
            violatedDirective: "script-src",
          })
        );
        expect(mocks.captureMessage).toHaveBeenCalledWith(
          "csp-report: script-src",
          expect.objectContaining({
            level: "warning",
            tags: expect.objectContaining({
              source: "csp-report",
              violatedDirective: "script-src",
            }),
          })
        );
        break;
      }
    }
    expect(logged).toBe(true);
  });

  it("still returns 204 if Sentry capture throws", async () => {
    mocks.captureMessage.mockImplementation(() => {
      throw new Error("sentry down");
    });
    const { POST } = await importRoute();
    let hit = false;
    for (let i = 0; i < 40; i += 1) {
      mocks.loggerWarn.mockClear();
      const response = await POST(
        new Request("http://localhost/api/csp-report", {
          method: "POST",
          headers: { "content-type": "application/csp-report" },
          body: JSON.stringify({
            "csp-report": {
              "violated-directive": "script-src",
              "blocked-uri": `sentry-fail-${i}`,
            },
          }),
        })
      );
      expect(response.status).toBe(204);
      if (mocks.loggerWarn.mock.calls.length > 0) {
        hit = true;
        break;
      }
    }
    expect(hit).toBe(true);
  });

  it("strips query/hash from documentUri and blockedUri before log/Sentry", async () => {
    const { POST, toPathOnlyUri } = await importRoute();

    expect(toPathOnlyUri("https://example.com/page?token=secret#frag")).toBe(
      "https://example.com/page"
    );
    expect(toPathOnlyUri("inline")).toBe("inline");
    expect(toPathOnlyUri("https://evil.example/x?a=1#h")).toBe("https://evil.example/x");

    let logged = false;
    for (let i = 0; i < 40; i += 1) {
      mocks.loggerWarn.mockClear();
      mocks.captureMessage.mockClear();
      const response = await POST(
        new Request("http://localhost/api/csp-report", {
          method: "POST",
          headers: { "content-type": "application/csp-report" },
          body: JSON.stringify({
            "csp-report": {
              "document-uri": "https://example.com/page?token=secret#frag",
              "violated-directive": "script-src",
              // vary blocked-uri so sampling eventually hits
              "blocked-uri": `https://evil.example/x?a=1#h-${i}`,
            },
          }),
        })
      );
      expect(response.status).toBe(204);
      if (mocks.loggerWarn.mock.calls.length > 0) {
        logged = true;
        const context = mocks.loggerWarn.mock.calls[0]?.[1] as {
          documentUri?: string;
          blockedUri?: string;
        };
        expect(context.documentUri).toBe("https://example.com/page");
        expect(context.blockedUri).toBe("https://evil.example/x");
        expect(context.documentUri).not.toMatch(/[?#]/);
        expect(context.blockedUri).not.toMatch(/[?#]/);

        const sentryExtra = mocks.captureMessage.mock.calls[0]?.[1] as {
          extra?: { documentUri?: string; blockedUri?: string };
          fingerprint?: string[];
        };
        expect(sentryExtra.extra?.documentUri).toBe("https://example.com/page");
        expect(sentryExtra.extra?.blockedUri).toBe("https://evil.example/x");
        expect(sentryExtra.fingerprint?.[2]).toBe("https://evil.example/x");
        break;
      }
    }
    expect(logged).toBe(true);
  });
});
