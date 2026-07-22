import { describe, expect, it, vi } from "vitest";

// Avoid initializing NextAuth when loading proxy.ts default export.
vi.mock("@/lib/auth", () => ({
  auth: (handler: unknown) => handler,
}));

import {
  finalizeProxyResponse,
  resolveAdminGate,
} from "@/proxy";
import { CSP_NONCE_HEADER, type DynamicCspContext } from "@/lib/csp";

function makeCtx(overrides?: Partial<DynamicCspContext>): DynamicCspContext {
  const nonce = overrides?.nonce ?? "test-nonce";
  const requestHeaders =
    overrides?.requestHeaders ??
    (() => {
      const h = new Headers();
      h.set(CSP_NONCE_HEADER, nonce);
      return h;
    })();
  return {
    nonce,
    requestHeaders,
    responseHeaderPairs: overrides?.responseHeaderPairs ?? [
      {
        key: "Content-Security-Policy",
        value: `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
      },
      {
        key: "Content-Security-Policy-Report-Only",
        value: `script-src 'self' 'nonce-${nonce}'; report-uri /api/csp-report`,
      },
    ],
  };
}

describe("resolveAdminGate", () => {
  const base = "https://example.com";

  it("returns null for public paths (pass through)", () => {
    expect(
      resolveAdminGate({ pathname: "/", isAdmin: false, url: base })
    ).toBeNull();
    expect(
      resolveAdminGate({ pathname: "/resources", isAdmin: false, url: base })
    ).toBeNull();
  });

  it("returns null for public API if matched", () => {
    expect(
      resolveAdminGate({
        pathname: "/api/search",
        isAdmin: false,
        url: base,
      })
    ).toBeNull();
  });

  it("redirects non-admin away from /admin pages", () => {
    const res = resolveAdminGate({
      pathname: "/admin",
      isAdmin: false,
      url: `${base}/admin`,
    });
    expect(res?.status).toBe(307);
    expect(res?.headers.get("location")).toBe(`${base}/login`);
  });

  it("returns 401 JSON for non-admin /api/admin/*", () => {
    const res = resolveAdminGate({
      pathname: "/api/admin/links",
      isAdmin: false,
      url: `${base}/api/admin/links`,
    });
    expect(res?.status).toBe(401);
  });

  it("allows admin on /admin", () => {
    expect(
      resolveAdminGate({
        pathname: "/admin/links",
        isAdmin: true,
        url: `${base}/admin/links`,
      })
    ).toBeNull();
  });

  it("redirects admin from /login to /admin", () => {
    const res = resolveAdminGate({
      pathname: "/login",
      isAdmin: true,
      url: `${base}/login`,
    });
    expect(res?.status).toBe(307);
    expect(res?.headers.get("location")).toBe(`${base}/admin`);
  });
});

describe("finalizeProxyResponse", () => {
  it("returns bare next when CSP dynamic context is null", () => {
    const res = finalizeProxyResponse({
      gate: null,
      requestHeaders: new Headers(),
      cspContext: null,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Security-Policy")).toBeNull();
  });

  it("returns gate unchanged when dynamic CSP is off", () => {
    const gate = resolveAdminGate({
      pathname: "/admin",
      isAdmin: false,
      url: "https://example.com/admin",
    })!;
    const res = finalizeProxyResponse({
      gate,
      requestHeaders: new Headers(),
      cspContext: null,
    });
    expect(res.status).toBe(307);
    expect(res.headers.get("Content-Security-Policy")).toBeNull();
  });

  it("stamps next() with CSP headers when dynamic context present", () => {
    const ctx = makeCtx();
    const res = finalizeProxyResponse({
      gate: null,
      requestHeaders: new Headers({ accept: "text/html" }),
      cspContext: ctx,
    });
    expect(res.headers.get("Content-Security-Policy")).toContain(
      "'nonce-test-nonce'"
    );
    expect(res.headers.get("Content-Security-Policy-Report-Only")).toContain(
      "report-uri"
    );
  });

  it("applies CSP to redirect responses without dropping Location", () => {
    const gate = resolveAdminGate({
      pathname: "/admin",
      isAdmin: false,
      url: "https://example.com/admin",
    })!;
    const res = finalizeProxyResponse({
      gate,
      requestHeaders: new Headers(),
      cspContext: makeCtx(),
    });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://example.com/login");
    expect(res.headers.get("Content-Security-Policy")).toContain("nonce-");
  });

  it("uses createContext factory when cspContext not injected", () => {
    const factory = vi.fn().mockReturnValue(null);
    const res = finalizeProxyResponse({
      gate: null,
      requestHeaders: new Headers({ "x-test": "1" }),
      createContext: factory,
    });
    expect(factory).toHaveBeenCalledOnce();
    expect(res.headers.get("Content-Security-Policy")).toBeNull();
  });
});
