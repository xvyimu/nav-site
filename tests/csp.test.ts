import { describe, expect, it } from "vitest";
import {
  buildEnforcingCsp,
  buildReportOnlyCsp,
  buildCspHeaderPairs,
  createCspNonce,
  createDynamicCspAttachment,
  CSP_NONCE_HEADER,
  readCspFlags,
} from "@/lib/csp";

describe("lib/csp", () => {
  it("defaults flags: report-only on, script unsafe-inline on, dynamic off", () => {
    expect(readCspFlags({})).toEqual({
      reportOnlyEnabled: true,
      scriptUnsafeInline: true,
      dynamic: false,
    });
  });

  it("parses CSP_* env flags", () => {
    expect(
      readCspFlags({
        CSP_REPORT_ONLY: "0",
        CSP_SCRIPT_UNSAFE_INLINE: "0",
        CSP_DYNAMIC: "1",
      })
    ).toEqual({
      reportOnlyEnabled: false,
      scriptUnsafeInline: false,
      dynamic: true,
    });
  });

  it("enforcing CSP includes unsafe-inline by default and GA hosts", () => {
    const csp = buildEnforcingCsp({ isDev: false });
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("https://www.googletagmanager.com");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("enforcing CSP can drop unsafe-inline via flag", () => {
    const csp = buildEnforcingCsp({ isDev: false, scriptUnsafeInline: false });
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("enforcing CSP with nonce adds nonce + strict-dynamic (unsafe-inline still listed for migration)", () => {
    const csp = buildEnforcingCsp({
      isDev: false,
      scriptUnsafeInline: true,
      nonce: "abc123",
    });
    expect(csp).toContain("'nonce-abc123'");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("'unsafe-inline'");
  });

  it("report-only never allows script unsafe-inline and has report-uri", () => {
    const csp = buildReportOnlyCsp({ isDev: false });
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).toContain("report-uri /api/csp-report");
  });

  it("header pairs honor reportOnlyEnabled", () => {
    const both = buildCspHeaderPairs({ reportOnlyEnabled: true });
    expect(both.map((h) => h.key)).toEqual([
      "Content-Security-Policy",
      "Content-Security-Policy-Report-Only",
    ]);
    const one = buildCspHeaderPairs({ reportOnlyEnabled: false });
    expect(one.map((h) => h.key)).toEqual(["Content-Security-Policy"]);
  });

  it("createCspNonce returns non-empty url-safe string", () => {
    const a = createCspNonce();
    const b = createCspNonce();
    expect(a.length).toBeGreaterThan(10);
    expect(a).not.toEqual(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("createDynamicCspAttachment returns null when CSP_DYNAMIC is off (default)", () => {
    expect(createDynamicCspAttachment({})).toBeNull();
    expect(createDynamicCspAttachment({ CSP_DYNAMIC: "0" })).toBeNull();
  });

  it("createDynamicCspAttachment emits nonce + CSP pairs when CSP_DYNAMIC=1", () => {
    const att = createDynamicCspAttachment(
      {
        CSP_DYNAMIC: "1",
        CSP_REPORT_ONLY: "1",
        CSP_SCRIPT_UNSAFE_INLINE: "1",
        NODE_ENV: "production",
      },
      { nonce: "testnonce01" }
    );
    expect(att).not.toBeNull();
    expect(att!.nonce).toBe("testnonce01");
    expect(att!.flags.dynamic).toBe(true);
    expect(att!.flags.scriptUnsafeInline).toBe(true);

    const keys = att!.pairs.map((p) => p.key);
    expect(keys).toContain("Content-Security-Policy");
    expect(keys).toContain("Content-Security-Policy-Report-Only");

    const enforcing = att!.pairs.find(
      (p) => p.key === "Content-Security-Policy"
    )!.value;
    expect(enforcing).toContain("'nonce-testnonce01'");
    expect(enforcing).toContain("'strict-dynamic'");
    // Migration: unsafe-inline still present when flag on (browsers ignore it with nonce).
    expect(enforcing).toContain("'unsafe-inline'");
  });

  it("createDynamicCspAttachment can omit Report-Only and drop unsafe-inline via flags", () => {
    const att = createDynamicCspAttachment(
      {
        CSP_DYNAMIC: "1",
        CSP_REPORT_ONLY: "0",
        CSP_SCRIPT_UNSAFE_INLINE: "0",
        NODE_ENV: "production",
      },
      { nonce: "strictn0" }
    );
    expect(att).not.toBeNull();
    expect(att!.pairs.map((p) => p.key)).toEqual(["Content-Security-Policy"]);
    const csp = att!.pairs[0].value;
    expect(csp).toContain("'nonce-strictn0'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("exposes CSP_NONCE_HEADER as x-nonce", () => {
    expect(CSP_NONCE_HEADER).toBe("x-nonce");
  });
});
