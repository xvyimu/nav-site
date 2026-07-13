import { describe, expect, it } from "vitest";
import {
  hashAdminPassword,
  verifyAdminPassword,
  describeAdminPasswordSource,
} from "@/lib/admin-password";

describe("admin-password", () => {
  it("hashes and verifies scrypt secrets", async () => {
    const hash = await hashAdminPassword("correct-horse");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(
      await verifyAdminPassword("correct-horse", {
        ADMIN_PASSWORD_HASH: hash,
      })
    ).toBe(true);
    expect(
      await verifyAdminPassword("wrong", {
        ADMIN_PASSWORD_HASH: hash,
      })
    ).toBe(false);
  });

  it("prefers hash over plaintext when both set", async () => {
    const hash = await hashAdminPassword("hashed-secret");
    expect(
      await verifyAdminPassword("hashed-secret", {
        ADMIN_PASSWORD_HASH: hash,
        ADMIN_PASSWORD: "plaintext-other",
      })
    ).toBe(true);
    expect(
      await verifyAdminPassword("plaintext-other", {
        ADMIN_PASSWORD_HASH: hash,
        ADMIN_PASSWORD: "plaintext-other",
      })
    ).toBe(false);
  });

  it("falls back to timing-safe plaintext when only ADMIN_PASSWORD is set (non-production)", async () => {
    expect(
      await verifyAdminPassword("plain", {
        ADMIN_PASSWORD: "plain",
        NODE_ENV: "development",
      })
    ).toBe(true);
    expect(
      await verifyAdminPassword("nope", {
        ADMIN_PASSWORD: "plain",
        NODE_ENV: "development",
      })
    ).toBe(false);
  });

  it("rejects plaintext ADMIN_PASSWORD in production / Vercel", async () => {
    expect(
      await verifyAdminPassword("plain", {
        ADMIN_PASSWORD: "plain",
        NODE_ENV: "production",
      })
    ).toBe(false);
    expect(
      await verifyAdminPassword("plain", {
        ADMIN_PASSWORD: "plain",
        VERCEL: "1",
      })
    ).toBe(false);
  });

  it("returns false when no password env is configured", async () => {
    expect(await verifyAdminPassword("anything", {})).toBe(false);
  });

  it("describes password source", () => {
    expect(describeAdminPasswordSource({ ADMIN_PASSWORD_HASH: "x" })).toBe("hash");
    expect(describeAdminPasswordSource({ ADMIN_PASSWORD: "x" })).toBe("plaintext");
    expect(describeAdminPasswordSource({})).toBe("missing");
  });

  it("rejects malformed hash strings", async () => {
    expect(
      await verifyAdminPassword("x", {
        ADMIN_PASSWORD_HASH: "not-a-hash",
      })
    ).toBe(false);
  });
});
