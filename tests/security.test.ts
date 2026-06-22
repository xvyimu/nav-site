import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin, unauthorized } from "@/lib/admin-auth";

// ─── Mock @/lib/auth ───

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/lib/auth";

describe("admin-auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns unauthorized when no session exists", async () => {
    (auth as any).mockResolvedValue(null);
    const result = await requireAdmin();
    expect(result.authorized).toBe(false);
  });

  it("returns authorized when session.user exists", async () => {
    (auth as any).mockResolvedValue({ user: { id: "admin" } });
    const result = await requireAdmin();
    expect(result.authorized).toBe(true);
  });

  it("returns 401 JSON response via unauthorized()", () => {
    const response = unauthorized();
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});

// ─── Submit Zod Schema Validation ───

const submitSchema = z.object({
  title: z.string().min(1, "站点名称不能为空").max(100, "站点名称不能超过 100 字符"),
  url: z.string()
    .url("URL 格式不正确")
    .refine((u) => {
      try {
        return new URL(u).protocol === "http:" || new URL(u).protocol === "https:";
      } catch {
        return false;
      }
    }, "仅允许 http/https 协议")
    .max(2000, "URL 不能超过 2000 字符"),
  description: z.string().max(500, "描述不能超过 500 字符").nullish().default(null),
  category_id: z.string().uuid("分类 ID 格式不正确").nullable().nullish().default(null),
});

describe("submitSchema validation", () => {
  it("accepts valid submission", () => {
    const result = submitSchema.safeParse({
      title: "Test Site",
      url: "https://example.com",
      description: "A test site",
      category_id: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty title", () => {
    const result = submitSchema.safeParse({ title: "", url: "https://example.com" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.title).toBeDefined();
    }
  });

  it("rejects title exceeding 100 chars", () => {
    const result = submitSchema.safeParse({ title: "x".repeat(101), url: "https://example.com" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid URL format", () => {
    const result = submitSchema.safeParse({ title: "Test", url: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("rejects javascript: URL (XSS attempt)", () => {
    const result = submitSchema.safeParse({ title: "Test", url: "javascript:alert(1)" });
    expect(result.success).toBe(false);
  });

  it("rejects data: URL", () => {
    const result = submitSchema.safeParse({ title: "Test", url: "data:text/html,<script>alert(1)</script>" });
    expect(result.success).toBe(false);
  });

  it("rejects URL exceeding 2000 chars", () => {
    const longUrl = "https://example.com/" + "x".repeat(1990);
    const result = submitSchema.safeParse({ title: "Test", url: longUrl });
    expect(result.success).toBe(false);
  });

  it("rejects description exceeding 500 chars", () => {
    const result = submitSchema.safeParse({
      title: "Test",
      url: "https://example.com",
      description: "x".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID category_id", () => {
    const result = submitSchema.safeParse({
      title: "Test",
      url: "https://example.com",
      category_id: "<script>alert(1)</script>",
    });
    expect(result.success).toBe(false);
  });

  it("accepts null category_id (optional)", () => {
    const result = submitSchema.safeParse({ title: "Test", url: "https://example.com", category_id: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category_id).toBeNull();
    }
  });
});

// ─── isSafeUrl (from LinkCard) ───

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

describe("isSafeUrl", () => {
  it("accepts https URLs", () => {
    expect(isSafeUrl("https://example.com")).toBe(true);
  });

  it("accepts http URLs", () => {
    expect(isSafeUrl("http://example.com")).toBe(true);
  });

  it("rejects javascript: URLs", () => {
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects data: URLs", () => {
    expect(isSafeUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("rejects void: URLs", () => {
    expect(isSafeUrl("void:0")).toBe(false);
  });

  it("rejects file: URLs", () => {
    expect(isSafeUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejects invalid URLs", () => {
    expect(isSafeUrl("not-a-url-at-all")).toBe(false);
  });

  it("rejects javascript: with URL-encoded chars", () => {
    expect(isSafeUrl("javascript:%0aalert(1)")).toBe(false);
  });
});
