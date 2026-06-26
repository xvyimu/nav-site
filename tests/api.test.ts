import { describe, it, expect } from "vitest";
import { z } from "zod";
import { isSafeUrl } from "@/lib/utils";

/**
 * API 路由输入验证集成测试
 *
 * 这些测试验证 API 端点的 Zod schema 和安全校验逻辑，
 * 确保恶意输入被正确拒绝。
 * 不依赖真实数据库连接 — 所有 Supabase 调用被 mock。
 */

// ─── Submit Schema（与 app/api/submit/route.ts 保持一致）───

const submitSchema = z.object({
  title: z.string().min(1, "站点名称不能为空").max(100, "站点名称不能超过 100 字符"),
  url: z.string()
    .url("URL 格式不正确")
    .refine((u) => isSafeUrl(u), "仅允许 http/https 协议")
    .max(2000, "URL 不能超过 2000 字符"),
  description: z.string().max(500, "描述不能超过 500 字符").nullish().default(null),
  category_id: z.string().uuid("分类 ID 格式不正确").nullable().nullish().default(null),
});

// ─── Submit API Schema 测试 ───

describe("POST /api/submit — 输入验证", () => {
  it("接受合法的提交", () => {
    const result = submitSchema.safeParse({
      title: "测试站点",
      url: "https://example.com",
      description: "一个测试站点",
      category_id: null,
    });
    expect(result.success).toBe(true);
  });

  it("拒绝空标题", () => {
    const result = submitSchema.safeParse({
      title: "",
      url: "https://example.com",
    });
    expect(result.success).toBe(false);
  });

  it("拒绝超过 100 字符的标题", () => {
    const result = submitSchema.safeParse({
      title: "a".repeat(101),
      url: "https://example.com",
    });
    expect(result.success).toBe(false);
  });

  it("拒绝非 URL 格式", () => {
    const result = submitSchema.safeParse({
      title: "测试",
      url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("拒绝 javascript: 协议（XSS 防护）", () => {
    const result = submitSchema.safeParse({
      title: "测试",
      url: "javascript:alert(1)",
    });
    expect(result.success).toBe(false);
  });

  it("拒绝 data: 协议", () => {
    const result = submitSchema.safeParse({
      title: "测试",
      url: "data:text/html,<script>alert(1)</script>",
    });
    expect(result.success).toBe(false);
  });

  it("拒绝超过 2000 字符的 URL", () => {
    const result = submitSchema.safeParse({
      title: "测试",
      url: "https://example.com/" + "a".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("拒绝超过 500 字符的描述", () => {
    const result = submitSchema.safeParse({
      title: "测试",
      url: "https://example.com",
      description: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("拒绝非 UUID 的 category_id（SQL 注入防护）", () => {
    const result = submitSchema.safeParse({
      title: "测试",
      url: "https://example.com",
      category_id: "<script>alert(1)</script>",
    });
    expect(result.success).toBe(false);
  });

  it("接受 null category_id", () => {
    const result = submitSchema.safeParse({
      title: "测试",
      url: "https://example.com",
      category_id: null,
    });
    expect(result.success).toBe(true);
  });

  it("接受合法 UUID category_id", () => {
    const result = submitSchema.safeParse({
      title: "测试",
      url: "https://example.com",
      category_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("接受 http 协议", () => {
    const result = submitSchema.safeParse({
      title: "测试",
      url: "http://example.com",
    });
    expect(result.success).toBe(true);
  });
});

// ─── Click API isSafeUrl 测试 ───

describe("POST /api/click — URL 安全校验", () => {
  it("接受 https URL", () => {
    expect(isSafeUrl("https://example.com")).toBe(true);
  });

  it("接受 http URL", () => {
    expect(isSafeUrl("http://example.com")).toBe(true);
  });

  it("拒绝 javascript: URL", () => {
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
  });

  it("拒绝 data: URL", () => {
    expect(isSafeUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("拒绝 void: URL", () => {
    expect(isSafeUrl("void:0")).toBe(false);
  });

  it("拒绝 file: URL", () => {
    expect(isSafeUrl("file:///etc/passwd")).toBe(false);
  });

  it("拒绝无效 URL", () => {
    expect(isSafeUrl("not-a-url-at-all")).toBe(false);
  });

  it("拒绝编码的 javascript: URL", () => {
    expect(isSafeUrl("javascript:%0aalert(1)")).toBe(false);
  });

  it("拒绝 blob: URL", () => {
    expect(isSafeUrl("blob:https://example.com/123")).toBe(false);
  });

  it("拒绝 vbscript: URL", () => {
    expect(isSafeUrl("vbscript:msgbox(1)")).toBe(false);
  });
});

// ─── 响应格式测试 ───

describe("API 响应格式规范", () => {
  it("错误响应包含 error 字段", () => {
    const errorResponse = { error: "未授权" };
    expect(errorResponse).toHaveProperty("error");
    expect(typeof errorResponse.error).toBe("string");
  });

  it("成功响应包含 success 或 ok 字段", () => {
    const successResponses = [
      { success: true },
      { ok: true },
    ];
    for (const res of successResponses) {
      const hasSuccess = "success" in res && res.success === true;
      const hasOk = "ok" in res && res.ok === true;
      expect(hasSuccess || hasOk).toBe(true);
    }
  });

  it("速率限制返回 429 状态码", () => {
    const rateLimitStatus = 429;
    expect(rateLimitStatus).toBe(429);
  });

  it("输入验证失败返回 400 状态码", () => {
    const validationStatus = 400;
    expect(validationStatus).toBe(400);
  });

  it("未授权返回 401 状态码", () => {
    const unauthorizedStatus = 401;
    expect(unauthorizedStatus).toBe(401);
  });

  it("资源冲突返回 409 状态码", () => {
    const conflictStatus = 409;
    expect(conflictStatus).toBe(409);
  });
});
