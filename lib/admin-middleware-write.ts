import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin";
import { verifyCsrf } from "@/lib/csrf";

type AdminWriteHandler<T extends unknown[] = unknown[]> = (
  ...args: T
) => Promise<NextResponse>;

/**
 * 写操作中间件：Admin 认证 + CSRF 保护
 * 自动从请求体中提取 _csrf 字段验证
 */
export function withAdminWrite<T extends unknown[]>(handler: AdminWriteHandler<T>): AdminWriteHandler<T> {
  return async (...args: T) => {
    // Admin 认证
    if (!(await verifyAdmin())) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    // 提取请求
    const request = args[0] as NextRequest | undefined;
    if (!request) {
      return NextResponse.json({ error: "内部错误" }, { status: 500 });
    }

    // 跳过 GET/HEAD 的 CSRF 检查
    const method = request.method.toUpperCase();
    if (method === "GET" || method === "HEAD") {
      return handler(...args);
    }

    // 从请求体中提取 CSRF token
    try {
      const contentType = request.headers.get("content-type") ?? "";
      let csrfToken: string | null = null;

      if (contentType.includes("application/json")) {
        const body = await request.clone().json();
        csrfToken = (body as Record<string, string | null>)?._csrf ?? null;
      } else if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
        const formData = await request.clone().formData();
        csrfToken = formData.get("_csrf") as string | null;
      }

      if (!(await verifyCsrf(csrfToken))) {
        return NextResponse.json({ error: "CSRF 验证失败" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "CSRF 验证失败" }, { status: 403 });
    }

    return handler(...args);
  };
}
