import { describe, it, expect, vi, beforeEach } from "vitest";

// ═══════════════════════════════════════════════════════════════
// vi.hoisted — variables available inside vi.mock factories
// ═══════════════════════════════════════════════════════════════

const { makeChain, createClient, createServiceRoleClient } = vi.hoisted(() => {
  function makeChain(response?: {
    data: unknown;
    error?: { code?: string; message?: string } | null;
    count?: number;
  }) {
    const r = { data: null, error: null, count: 0, ...response };
    const chain: Record<string, unknown> = {};
    return new Proxy(chain, {
      get(_target, prop: string) {
        if (prop === "data") return r.data;
        if (prop === "error") return r.error;
        if (prop === "count") return r.count;
        if (prop === "then") return (onFulfilled: (v: typeof r) => unknown) => onFulfilled(r);
        if (prop === "maybeSingle" || prop === "single")
          return () => Promise.resolve({ data: r.data, error: r.error });
        // Chainable — return proxy so chains work
        return () => proxy;
      },
    });
  }

  const proxy = makeChain();

  const createClient = vi.fn(() => makeChain());
  const createServiceRoleClient = vi.fn(() => makeChain());

  return { makeChain, createClient, createServiceRoleClient };
});

// ═══════════════════════════════════════════════════════════════
// vi.mock — uses hoisted variables
// ═══════════════════════════════════════════════════════════════

vi.mock("@/lib/supabase/server", () => ({
  createClient,
  createStaticClient: createClient,
  createServiceRoleClient,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// ═══════════════════════════════════════════════════════════════
// Imports (after mocks)
// ═══════════════════════════════════════════════════════════════

import { submitLinkSchema, reviewSchema, linkIdsSchema } from "@/lib/schemas";
import { isSafeUrl } from "@/lib/utils";

function resetMocks() {
  vi.clearAllMocks();
  createClient.mockReturnValue(makeChain());
  createServiceRoleClient.mockReturnValue(makeChain());
}

// ═══════════════════════════════════════════════════════════════
// submitLinkSchema — 提交输入安全
// ═══════════════════════════════════════════════════════════════

describe("submitLinkSchema — 输入安全", () => {
  beforeEach(() => { resetMocks(); });

  it("接受合法输入", () => {
    expect(submitLinkSchema.safeParse({
      title: "Test Site",
      url: "https://example.com",
      description: "A test site",
      category_id: "550e8400-e29b-41d4-a716-446655440000",
    }).success).toBe(true);
  });

  it("接受 null category_id", () => {
    expect(submitLinkSchema.safeParse({
      title: "Test",
      url: "https://example.com",
      category_id: null,
    }).success).toBe(true);
  });

  it("拒绝 javascript: URL (XSS 防护)", () => {
    expect(submitLinkSchema.safeParse({
      title: "Test", url: "javascript:alert(1)",
    }).success).toBe(false);
  });

  it("拒绝 data: URL (XSS 防护)", () => {
    expect(submitLinkSchema.safeParse({
      title: "Test",
      url: "data:text/html,<script>alert(1)</script>",
    }).success).toBe(false);
  });

  it("拒绝非 UUID category_id (注入防护)", () => {
    expect(submitLinkSchema.safeParse({
      title: "Test",
      url: "https://example.com",
      category_id: "<script>alert(1)</script>",
    }).success).toBe(false);
  });

  it("拒绝 union-inject category_id", () => {
    expect(submitLinkSchema.safeParse({
      title: "Test",
      url: "https://example.com",
      category_id: "1' OR '1'='1",
    }).success).toBe(false);
  });

  it("拒绝 101 字符标题 (长度边界)", () => {
    expect(submitLinkSchema.safeParse({
      title: "a".repeat(101),
      url: "https://example.com",
    }).success).toBe(false);
  });

  it("拒绝 2001 字符 URL (长度边界)", () => {
    expect(submitLinkSchema.safeParse({
      title: "Test",
      url: "https://example.com/" + "a".repeat(2001),
    }).success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// reviewSchema — 评价输入安全
// ═══════════════════════════════════════════════════════════════

describe("reviewSchema — 输入安全", () => {
  beforeEach(() => { resetMocks(); });

  it("接受合法评价", () => {
    expect(reviewSchema.safeParse({
      link_id: "550e8400-e29b-41d4-a716-446655440000",
      rating: 5,
      comment: "Great tool!",
    }).success).toBe(true);
  });

  it("接受 null 评论", () => {
    expect(reviewSchema.safeParse({
      link_id: "550e8400-e29b-41d4-a716-446655440000",
      rating: 3,
      comment: null,
    }).success).toBe(true);
  });

  it("拒绝非 UUID link_id (注入防护)", () => {
    expect(reviewSchema.safeParse({
      link_id: "not-a-uuid", rating: 5,
    }).success).toBe(false);
  });

  it("拒绝 XSS link_id", () => {
    expect(reviewSchema.safeParse({
      link_id: "<script>alert(1)</script>", rating: 5,
    }).success).toBe(false);
  });

  it("拒绝 SQL 注入 link_id", () => {
    expect(reviewSchema.safeParse({
      link_id: "1'; DROP TABLE reviews; --", rating: 5,
    }).success).toBe(false);
  });

  it("拒绝评分 0 (边界)", () => {
    expect(reviewSchema.safeParse({
      link_id: "550e8400-e29b-41d4-a716-446655440000", rating: 0,
    }).success).toBe(false);
  });

  it("拒绝评分 6 (边界)", () => {
    expect(reviewSchema.safeParse({
      link_id: "550e8400-e29b-41d4-a716-446655440000", rating: 6,
    }).success).toBe(false);
  });

  it("拒绝非整数评分", () => {
    expect(reviewSchema.safeParse({
      link_id: "550e8400-e29b-41d4-a716-446655440000", rating: 3.5,
    }).success).toBe(false);
  });

  it("拒绝 501 字符评论 (长度边界)", () => {
    expect(reviewSchema.safeParse({
      link_id: "550e8400-e29b-41d4-a716-446655440000",
      rating: 5,
      comment: "a".repeat(501),
    }).success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// linkIdsSchema — 批量操作安全
// ═══════════════════════════════════════════════════════════════

describe("linkIdsSchema — 批量操作安全", () => {
  beforeEach(() => { resetMocks(); });

  it("接受合法 UUID 数组", () => {
    expect(linkIdsSchema.safeParse([
      "550e8400-e29b-41d4-a716-446655440000",
      "550e8400-e29b-41d4-a716-446655440001",
    ]).success).toBe(true);
  });

  it("拒绝空数组 (min 1)", () => {
    expect(linkIdsSchema.safeParse([]).success).toBe(false);
  });

  it("拒绝超过 100 项", () => {
    expect(linkIdsSchema.safeParse(Array(101).fill("550e8400-e29b-41d4-a716-446655440000")).success).toBe(false);
  });

  it("拒绝含非 UUID 的数组", () => {
    expect(linkIdsSchema.safeParse(["not-a-uuid"]).success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// isSafeUrl — URL 协议白名单
// ═══════════════════════════════════════════════════════════════

describe("isSafeUrl — 协议白名单", () => {
  beforeEach(() => { resetMocks(); });

  it("接受 https URL", () => expect(isSafeUrl("https://example.com")).toBe(true));
  it("接受 http URL", () => expect(isSafeUrl("http://example.com")).toBe(true));

  it("拒绝 javascript: URL", () => expect(isSafeUrl("javascript:alert(1)")).toBe(false));
  it("拒绝 javascript: 编码换行", () => expect(isSafeUrl("javascript:%0aalert(1)")).toBe(false));
  it("拒绝 data: URL", () => expect(isSafeUrl("data:text/html,<script>alert(1)</script>")).toBe(false));
  it("拒绝 void: URL", () => expect(isSafeUrl("void:0")).toBe(false));
  it("拒绝 file: URL (路径遍历)", () => expect(isSafeUrl("file:///etc/passwd")).toBe(false));
  it("拒绝 blob: URL", () => expect(isSafeUrl("blob:https://example.com/123")).toBe(false));
  it("拒绝 vbscript: URL", () => expect(isSafeUrl("vbscript:msgbox(1)")).toBe(false));
  it("拒绝 ftp: URL", () => expect(isSafeUrl("ftp://example.com")).toBe(false));
});

// ═══════════════════════════════════════════════════════════════
// rate-limit — 速率限制安全（security.test.ts 已有完整覆盖，此处跳过）
// ═══════════════════════════════════════════════════════════════
