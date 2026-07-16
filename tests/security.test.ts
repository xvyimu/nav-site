import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isSafeUrl,
  withTimeout,
  extractDomain,
  getClientIp,
  isBlockedOutboundHost,
  escapeJsonForHtml,
} from "@/lib/utils";
import { requireAdmin, unauthorized } from "@/lib/with-admin";
import {
  urlSchema, titleSchema, slugSchema,
  createLinkSchema, createCategorySchema, submitLinkSchema,
  linkIdsSchema, tagIdsSchema, createTagSchema, updateTagSchema,
} from "@/lib/schemas";

// ─── Mock @/lib/auth ───

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(null)),
}));

import { auth } from "@/lib/auth";

const mockAuth = vi.mocked(auth) as unknown as ReturnType<typeof vi.fn>;

describe("admin-auth (now in with-admin)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns unauthorized when no session exists", async () => {
    mockAuth.mockResolvedValue(null);
    const result = await requireAdmin();
    expect(result.authorized).toBe(false);
  });

  it("returns authorized when session.user has admin role", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin", role: "admin" } } as never);
    const result = await requireAdmin();
    expect(result.authorized).toBe(true);
  });

  it("returns unauthorized when session.user lacks admin role", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user1", role: "user" } } as never);
    const result = await requireAdmin();
    expect(result.authorized).toBe(false);
  });

  it("returns unauthorized when session.user has no role field", async () => {
    mockAuth.mockResolvedValue({ user: { id: "unknown" } } as never);
    const result = await requireAdmin();
    expect(result.authorized).toBe(false);
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

// ─── isSafeUrl (from lib/utils) ───

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

// ─── 速率限制（rate-limit）───

describe("checkMemoryRateLimit — 内存级备用速率限制", () => {
  // 通过 import 内的函数测试内存限制逻辑
  // 模块内部通过 checkRateLimit(failClose=true) 触发内存备用

  it("第一次请求始终放行", async () => {
    // 避免直接测试内部内存 Map 的竞态，通过 mock Supabase 失败+ failClose 触发备用
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceRoleClient: () => ({
        rpc: () => Promise.resolve({ data: null, error: { message: "DB down" } }),
      }),
    }));

    const { checkRateLimit } = await import("@/lib/rate-limit");
    const result = await checkRateLimit("login_attempts", "1.2.3.4", 60_000, 5, true);
    expect(result.allowed).toBe(true);
  });

  it("超过内存桶上限后拒绝（failClose 模式）", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceRoleClient: () => ({
        rpc: () => Promise.resolve({ data: null, error: { message: "DB down" } }),
      }),
    }));

    const { checkRateLimit } = await import("@/lib/rate-limit");
    // 连续超过 maxAttempts 次
    for (let i = 0; i < 5; i++) {
      await checkRateLimit("login_attempts", "5.6.7.8", 60_000, 3, true);
    }
    const result = await checkRateLimit("login_attempts", "5.6.7.8", 60_000, 3, true);
    expect(result.allowed).toBe(false);
  });

  it("failOpen 模式下数据库故障时放行", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceRoleClient: () => ({
        rpc: () => Promise.resolve({ data: null, error: { message: "DB down" } }),
      }),
    }));

    const { checkRateLimit } = await import("@/lib/rate-limit");
    const result = await checkRateLimit("submit_attempts", "9.9.9.9", 60_000, 3);
    expect(result.allowed).toBe(true);
  });
});

describe("checkRateLimit — 数据库速率限制", () => {
  it("未超限时放行", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceRoleClient: () => ({
        rpc: () => Promise.resolve({
          data: [{ allowed: true, current_count: 2 }],
          error: null,
        }),
      }),
    }));

    const { checkRateLimit } = await import("@/lib/rate-limit");
    const result = await checkRateLimit("login_attempts", "1.2.3.4", 60_000, 5, true);
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(2);
  });

  it("超过上限时拒绝", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createServiceRoleClient: () => ({
        rpc: () => Promise.resolve({
          data: [{ allowed: false, current_count: 5 }],
          error: null,
        }),
      }),
    }));

    const { checkRateLimit } = await import("@/lib/rate-limit");
    const result = await checkRateLimit("login_attempts", "1.2.3.4", 60_000, 5, true);
    expect(result.allowed).toBe(false);
    expect(result.count).toBe(5);
  });
});

describe("checkClickRateLimit — 点击去重限流", () => {
  it("无历史点击时放行", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                gte: () => Promise.resolve({ count: 0, error: null }),
              }),
            }),
          }),
          delete: () => ({
            lt: () => Promise.resolve({ error: null }),
          }),
          insert: () => Promise.resolve({ error: null }),
        }),
        rpc: () => Promise.resolve({ error: null }),
      }),
    }));

    const { checkClickRateLimit } = await import("@/lib/rate-limit");
    const result = await checkClickRateLimit("1.2.3.4", "https://example.com");
    expect(result.allowed).toBe(true);
  });

  it("数据库故障时放行（fail-open）", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                gte: () => Promise.resolve({ count: null, error: new Error("DB error") }),
              }),
            }),
          }),
          delete: () => ({
            lt: () => Promise.resolve({ error: null }),
          }),
          insert: () => Promise.resolve({ error: null }),
        }),
        rpc: () => Promise.resolve({ error: null }),
      }),
    }));

    const { checkClickRateLimit } = await import("@/lib/rate-limit");
    const result = await checkClickRateLimit("1.2.3.4", "https://example.com");
    expect(result.allowed).toBe(true);
  });
});

describe("recordAttempt — 记录尝试", () => {
  it("正常记录不抛出异常", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: () => ({
        from: () => ({
          insert: () => Promise.resolve({ error: null }),
        }),
        rpc: () => Promise.resolve({ error: null }),
      }),
    }));

    const { recordAttempt } = await import("@/lib/rate-limit");
    await expect(recordAttempt("login_attempts", "1.2.3.4", false)).resolves.toBeUndefined();
  });

  it("数据库故障时静默失败", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: () => ({
        from: () => ({
          insert: () => Promise.resolve({ error: new Error("Insert failed") }),
        }),
        rpc: () => Promise.resolve({ error: null }),
      }),
    }));

    const { recordAttempt } = await import("@/lib/rate-limit");
    await expect(recordAttempt("login_attempts", "1.2.3.4", true)).resolves.toBeUndefined();
  });
});

describe("incrementClickCount — 递增点击计数", () => {
  it("正常递增不抛出异常", async () => {
    vi.resetModules();
    const client = {
      from: () => ({
        insert: () => Promise.resolve({ error: null }),
        delete: () => ({ lt: () => Promise.resolve({ error: null }) }),
      }),
      rpc: () => Promise.resolve({ error: null }),
    };
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: () => client,
      createServiceRoleClient: () => client,
    }));

    const { incrementClickCount } = await import("@/lib/rate-limit");
    await expect(incrementClickCount("https://example.com")).resolves.toBeUndefined();
  });

  it("RPC 失败时静默处理", async () => {
    vi.resetModules();
    const client = {
      from: () => ({
        insert: () => Promise.resolve({ error: null }),
        delete: () => ({ lt: () => Promise.resolve({ error: null }) }),
      }),
      rpc: () => Promise.resolve({ error: new Error("RPC error") }),
    };
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: () => client,
      createServiceRoleClient: () => client,
    }));

    const { incrementClickCount } = await import("@/lib/rate-limit");
    await expect(incrementClickCount("https://example.com")).resolves.toBeUndefined();
  });
});

// ─── 共享 Zod Schema 校验（从 lib/schemas 导入）───

describe("lib/schemas — URL 校验 (urlSchema)", () => {
  it("接受合法 https URL", () => {
    expect(urlSchema.safeParse("https://example.com").success).toBe(true);
  });

  it("接受合法 http URL", () => {
    expect(urlSchema.safeParse("http://example.com").success).toBe(true);
  });

  it("拒绝 javascript: 协议", () => {
    expect(urlSchema.safeParse("javascript:alert(1)").success).toBe(false);
  });

  it("拒绝 data: 协议", () => {
    expect(urlSchema.safeParse("data:text/html,<script>alert(1)</script>").success).toBe(false);
  });

  it("拒绝非 URL 字符串", () => {
    expect(urlSchema.safeParse("not-a-url").success).toBe(false);
  });

  it("拒绝空字符串", () => {
    expect(urlSchema.safeParse("").success).toBe(false);
  });

  it("拒绝超过 2000 字符的 URL", () => {
    const longUrl = "https://example.com/" + "x".repeat(1990);
    expect(urlSchema.safeParse(longUrl).success).toBe(false);
  });
});

describe("lib/schemas — 标题校验 (titleSchema)", () => {
  it("接受合法标题", () => {
    expect(titleSchema.safeParse("ChatGPT").success).toBe(true);
  });

  it("拒绝空标题", () => {
    expect(titleSchema.safeParse("").success).toBe(false);
  });

  it("拒绝超过 100 字符的标题", () => {
    expect(titleSchema.safeParse("x".repeat(101)).success).toBe(false);
  });

  it("接受 100 字符边界值", () => {
    expect(titleSchema.safeParse("x".repeat(100)).success).toBe(true);
  });
});

describe("lib/schemas — Slug 校验 (slugSchema)", () => {
  it("接受合法 slug", () => {
    expect(slugSchema.safeParse("ai-tools").success).toBe(true);
  });

  it("接受纯字母", () => {
    expect(slugSchema.safeParse("tools").success).toBe(true);
  });

  it("拒绝大写字母", () => {
    expect(slugSchema.safeParse("AI-Tools").success).toBe(false);
  });

  it("拒绝带空格的 slug", () => {
    expect(slugSchema.safeParse("ai tools").success).toBe(false);
  });

  it("拒绝空 slug", () => {
    expect(slugSchema.safeParse("").success).toBe(false);
  });

  it("拒绝中文 slug", () => {
    expect(slugSchema.safeParse("人工智能").success).toBe(false);
  });

  it("拒绝超过 50 字符", () => {
    expect(slugSchema.safeParse("x".repeat(51)).success).toBe(false);
  });
});

describe("lib/schemas — 创建链接 (createLinkSchema)", () => {
  it("接受合法提交", () => {
    const result = createLinkSchema.safeParse({
      title: "Example",
      url: "https://example.com",
      category_id: null,
    });
    expect(result.success).toBe(true);
  });

  it("拒绝缺少必填字段 title", () => {
    const result = createLinkSchema.safeParse({ url: "https://example.com" });
    expect(result.success).toBe(false);
  });

  it("拒绝缺少必填字段 url", () => {
    const result = createLinkSchema.safeParse({ title: "Example" });
    expect(result.success).toBe(false);
  });

  it("默认 approved=true", () => {
    const result = createLinkSchema.safeParse({
      title: "Example",
      url: "https://example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.approved).toBe(true);
    }
  });

  it("默认 featured=false", () => {
    const result = createLinkSchema.safeParse({
      title: "Example",
      url: "https://example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.featured).toBe(false);
    }
  });
});

describe("lib/schemas — 创建分类 (createCategorySchema)", () => {
  it("接受合法分类", () => {
    const result = createCategorySchema.safeParse({
      name: "AI 工具",
      slug: "ai-tools",
    });
    expect(result.success).toBe(true);
  });

  it("拒绝空名称", () => {
    const result = createCategorySchema.safeParse({ name: "", slug: "ai-tools" });
    expect(result.success).toBe(false);
  });

  it("拒绝超过 50 字符名称", () => {
    const result = createCategorySchema.safeParse({ name: "x".repeat(51), slug: "ai-tools" });
    expect(result.success).toBe(false);
  });

  it("拒绝非法 slug", () => {
    const result = createCategorySchema.safeParse({ name: "AI 工具", slug: "AI 工具" });
    expect(result.success).toBe(false);
  });

  it("接受带合法 UUID 的 parent_id", () => {
    const result = createCategorySchema.safeParse({
      name: "子分类",
      slug: "sub-cat",
      parent_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("拒绝非法 parent_id", () => {
    const result = createCategorySchema.safeParse({
      name: "子分类",
      slug: "sub-cat",
      parent_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("默认 sort_order=0", () => {
    const result = createCategorySchema.safeParse({
      name: "AI 工具",
      slug: "ai-tools",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort_order).toBe(0);
    }
  });
});

describe("lib/schemas — 提交链接 (submitLinkSchema)", () => {
  it("接受合法提交", () => {
    const result = submitLinkSchema.safeParse({
      title: "Test",
      url: "https://example.com",
    });
    expect(result.success).toBe(true);
  });

  it("拒绝空标题", () => {
    const result = submitLinkSchema.safeParse({ title: "", url: "https://example.com" });
    expect(result.success).toBe(false);
  });

  it("拒绝 javascript: URL", () => {
    const result = submitLinkSchema.safeParse({ title: "Test", url: "javascript:alert(1)" });
    expect(result.success).toBe(false);
  });

  it("默认 category_id 为 null", () => {
    const result = submitLinkSchema.safeParse({ title: "Test", url: "https://example.com" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category_id).toBeNull();
    }
  });

  it("接受合法 UUID category_id", () => {
    const result = submitLinkSchema.safeParse({
      title: "Test",
      url: "https://example.com",
      category_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });
});

describe("lib/schemas — 标签 (tagIdsSchema / createTagSchema / updateTagSchema)", () => {
  it("tagIdsSchema 接受合法 UUID 数组", () => {
    const result = tagIdsSchema.safeParse(["550e8400-e29b-41d4-a716-446655440000"]);
    expect(result.success).toBe(true);
  });

  it("tagIdsSchema 拒绝非法 UUID", () => {
    const result = tagIdsSchema.safeParse(["not-a-uuid"]);
    expect(result.success).toBe(false);
  });

  it("createTagSchema 接受合法标签", () => {
    const result = createTagSchema.safeParse({ name: "AI", slug: "ai" });
    expect(result.success).toBe(true);
  });

  it("createTagSchema 拒绝空名称", () => {
    const result = createTagSchema.safeParse({ name: "", slug: "ai" });
    expect(result.success).toBe(false);
  });

  it("updateTagSchema 接受部分字段", () => {
    const result = updateTagSchema.safeParse({ name: "AI" });
    expect(result.success).toBe(true);
  });

  it("updateTagSchema 接受空对象（全字段可选）", () => {
    const result = updateTagSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("lib/schemas — 链接 ID 列表 (linkIdsSchema)", () => {
  it("接受单个合法 UUID", () => {
    const result = linkIdsSchema.safeParse(["550e8400-e29b-41d4-a716-446655440000"]);
    expect(result.success).toBe(true);
  });

  it("拒绝空数组", () => {
    const result = linkIdsSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it("拒绝超过 100 个元素", () => {
    const result = linkIdsSchema.safeParse(Array(101).fill("550e8400-e29b-41d4-a716-446655440000"));
    expect(result.success).toBe(false);
  });

  it("拒绝非 UUID 元素", () => {
    const result = linkIdsSchema.safeParse(["invalid"]);
    expect(result.success).toBe(false);
  });
});

// ─── with-admin 包装器 ───
//
// 合并后 requireAdmin/unauthorized 与 withAdmin* 在同一模块，
// 通过 mock @/lib/auth 控制 requireAdmin 的返回值。

describe("withAdminGet — 只读路由包装器", () => {
  it("鉴权通过时执行 handler", async () => {
    vi.resetModules();
    vi.doMock("@/lib/auth", () => ({
      auth: vi.fn(() => Promise.resolve({ user: { id: "admin", role: "admin" } })),
    }));

    const { withAdminGet } = await import("@/lib/with-admin");
    const handler = vi.fn(async () => NextResponse.json({ data: "ok" }, { status: 200 }));
    const wrapped = withAdminGet(handler);

    const res = await wrapped();
    expect(handler).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
  });

  it("鉴权失败时返回 401 不执行 handler", async () => {
    vi.resetModules();
    vi.doMock("@/lib/auth", () => ({
      auth: vi.fn(() => Promise.resolve(null)),
    }));

    const { withAdminGet } = await import("@/lib/with-admin");
    const handler = vi.fn(async () => NextResponse.json({ data: "ok" }, { status: 200 }));
    const wrapped = withAdminGet(handler);

    const res = await wrapped();
    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
  });
});

describe("withAdminWrite — 写路由包装器（鉴权 + CSRF + Zod 校验）", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // 同源 Origin 构造器：便于复用
  const sameOriginReq = (body: unknown) =>
    new Request("http://localhost/api/admin/x", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
        host: "localhost",
      },
      body: JSON.stringify(body),
    });

  // Next.js 16 动态路由要求 handler 第二参数为 { params: Promise<...> }
  const mockCtx = { params: Promise.resolve({}) };

  it("鉴权通过 + 合法输入时执行 handler", async () => {
    vi.doMock("@/lib/auth", () => ({
      auth: vi.fn(() => Promise.resolve({ user: { id: "admin", role: "admin" } })),
    }));

    const { withAdminWrite } = await import("@/lib/with-admin");
    const schema = z.object({ name: z.string().min(1) });
    const handler = vi.fn(async ({ parsed }) =>
      NextResponse.json({ name: parsed.name }, { status: 200 })
    );
    const wrapped = withAdminWrite(schema, handler);

    const res = await wrapped(sameOriginReq({ name: "test" }), mockCtx);
    expect(handler).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
  });

  it("鉴权失败时返回 401", async () => {
    vi.doMock("@/lib/auth", () => ({
      auth: vi.fn(() => Promise.resolve(null)),
    }));

    const { withAdminWrite } = await import("@/lib/with-admin");
    const schema = z.object({ name: z.string().min(1) });
    const handler = vi.fn();
    const wrapped = withAdminWrite(schema, handler);

    const res = await wrapped(sameOriginReq({ name: "test" }), mockCtx);
    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
  });

  it("非法输入时返回 400 并包含验证错误详情", async () => {
    vi.doMock("@/lib/auth", () => ({
      auth: vi.fn(() => Promise.resolve({ user: { id: "admin", role: "admin" } })),
    }));

    const { withAdminWrite } = await import("@/lib/with-admin");
    const schema = z.object({ name: z.string().min(1) });
    const handler = vi.fn();
    const wrapped = withAdminWrite(schema, handler);

    const res = await wrapped(sameOriginReq({ name: "" }), mockCtx);
    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body).toHaveProperty("details");
  });

  it("跨站 Origin 请求被 CSRF 检查拒绝（403）", async () => {
    vi.doMock("@/lib/auth", () => ({
      auth: vi.fn(() => Promise.resolve({ user: { id: "admin", role: "admin" } })),
    }));

    const { withAdminWrite } = await import("@/lib/with-admin");
    const schema = z.object({ name: z.string().min(1) });
    const handler = vi.fn();
    const wrapped = withAdminWrite(schema, handler);

    const req = new Request("http://localhost/api/admin/x", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example.com",
        host: "localhost",
      },
      body: JSON.stringify({ name: "test" }),
    });
    const res = await wrapped(req, mockCtx);
    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(403);
  });

  it("handler 抛错时被自动 try-catch 捕获（500）", async () => {
    vi.doMock("@/lib/auth", () => ({
      auth: vi.fn(() => Promise.resolve({ user: { id: "admin", role: "admin" } })),
    }));

    const { withAdminWrite } = await import("@/lib/with-admin");
    const schema = z.object({ name: z.string().min(1) });
    const handler = vi.fn(async () => {
      throw new Error("DB down");
    });
    const wrapped = withAdminWrite(schema, handler);

    const res = await wrapped(sameOriginReq({ name: "test" }), mockCtx);
    expect(res.status).toBe(500);
  });
});

// ─── 工具函数（lib/utils）───

describe("withTimeout — Promise 超时", () => {
  it("在超时前 resolve 时返回结果", async () => {
    const result = await withTimeout(Promise.resolve("ok"), 1000);
    expect(result).toBe("ok");
  });

  it("在原 Promise 完成后清理 timeout timer", async () => {
    vi.useFakeTimers();
    try {
      const result = await withTimeout(Promise.resolve("ok"), 1000);
      expect(result).toBe("ok");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("超时后 reject", async () => {
    const slow = new Promise<string>((resolve) => setTimeout(resolve, 500));
    await expect(withTimeout(slow, 10)).rejects.toThrow("Timeout after 10ms");
  });

  it("ms <= 0 时原样返回", async () => {
    const result = await withTimeout(Promise.resolve("ok"), 0);
    expect(result).toBe("ok");
  });

  it("Promise reject 时传播错误", async () => {
    await expect(withTimeout(Promise.reject(new Error("fail")), 1000)).rejects.toThrow("fail");
  });
});

describe("extractDomain — 域名提取", () => {
  it("从 URL 中提取域名", () => {
    expect(extractDomain("https://www.example.com/path")).toBe("example.com");
  });

  it("处理无 www 前缀", () => {
    expect(extractDomain("https://example.com")).toBe("example.com");
  });

  it("处理多级子域名", () => {
    expect(extractDomain("https://sub.example.com")).toBe("sub.example.com");
  });

  it("处理非法 URL", () => {
    expect(extractDomain("not-a-url")).toBe("");
  });
});

describe("getClientIp — 客户端 IP 提取", () => {
  const originalVercel = process.env.VERCEL;

  afterEach(() => {
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
  });

  it("优先使用 x-nf-client-connection-ip", () => {
    delete process.env.VERCEL;
    const req = new Request("http://localhost", {
      headers: {
        "x-nf-client-connection-ip": "10.0.0.1",
        "x-forwarded-for": "203.0.113.1, 198.51.100.1",
      },
    });
    expect(getClientIp(req)).toBe("10.0.0.1");
  });

  it("优先使用 x-vercel-forwarded-for 最左段", () => {
    process.env.VERCEL = "1";
    const req = new Request("http://localhost", {
      headers: {
        "x-vercel-forwarded-for": "198.51.100.9, 203.0.113.1",
        "x-forwarded-for": "203.0.113.1, 198.51.100.1",
      },
    });
    expect(getClientIp(req)).toBe("198.51.100.9");
  });

  it("在 Vercel 上使用 x-forwarded-for 最右段（平台追加）", () => {
    process.env.VERCEL = "1";
    const req = new Request("http://localhost", {
      headers: {
        "x-forwarded-for": "203.0.113.1, 198.51.100.1",
      },
    });
    expect(getClientIp(req)).toBe("198.51.100.1");
  });

  it("非 Vercel 回退到 x-forwarded-for 最左段", () => {
    delete process.env.VERCEL;
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "203.0.113.1, 198.51.100.1" },
    });
    expect(getClientIp(req)).toBe("203.0.113.1");
  });

  it("非 Vercel 可使用 x-real-ip", () => {
    delete process.env.VERCEL;
    const req = new Request("http://localhost", {
      headers: {
        "x-real-ip": "198.51.100.9",
      },
    });
    expect(getClientIp(req)).toBe("198.51.100.9");
  });

  it("无 IP 头时返回 unknown", () => {
    delete process.env.VERCEL;
    const req = new Request("http://localhost");
    expect(getClientIp(req)).toBe("unknown");
  });
});

describe("isBlockedOutboundHost — 出站 host 黑名单", () => {
  it("阻止 localhost / 私网 / 元数据", () => {
    expect(isBlockedOutboundHost("localhost")).toBe(true);
    expect(isBlockedOutboundHost("127.0.0.1")).toBe(true);
    expect(isBlockedOutboundHost("10.0.0.1")).toBe(true);
    expect(isBlockedOutboundHost("192.168.1.1")).toBe(true);
    expect(isBlockedOutboundHost("169.254.169.254")).toBe(true);
    expect(isBlockedOutboundHost("metadata.google.internal")).toBe(true);
  });

  it("放行公网域名", () => {
    expect(isBlockedOutboundHost("example.com")).toBe(false);
    expect(isBlockedOutboundHost("cdn.openai.com")).toBe(false);
  });
});

describe("escapeJsonForHtml — JSON HTML 转义", () => {
  it("转义 < 和 >", () => {
    expect(escapeJsonForHtml('<script>alert(1)</script>')).toBe(
      "\\u003cscript\\u003ealert(1)\\u003c/script\\u003e"
    );
  });

  it("转义 &", () => {
    expect(escapeJsonForHtml("a&b")).toBe("a\\u0026b");
  });

  it("保留普通文本", () => {
    expect(escapeJsonForHtml("hello world")).toBe("hello world");
  });

  it("转义 Unicode 行分隔符", () => {
    expect(escapeJsonForHtml("a\u2028b")).toBe("a\\u2028b");
  });
});
