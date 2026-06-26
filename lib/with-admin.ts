import { requireAdmin, unauthorized } from "./admin-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Admin GET 路由包装器 — 只做鉴权检查
 */
export function withAdminGet(
  handler: () => Promise<NextResponse>,
): () => Promise<NextResponse> {
  return async () => {
    const { authorized } = await requireAdmin();
    if (!authorized) return unauthorized();
    return handler();
  };
}

/**
 * Admin POST/PUT 路由包装器 — 鉴权 + JSON body 校验
 *
 * handler 收到的 parsed 已是校验通过的类型安全数据
 */
export function withAdminWrite<T extends z.ZodType>(
  schema: T,
  handler: (params: { parsed: z.infer<T> }) => Promise<NextResponse>,
): (request: Request) => Promise<NextResponse> {
  return async (request: Request) => {
    const { authorized } = await requireAdmin();
    if (!authorized) return unauthorized();

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      return NextResponse.json({ error: "输入验证失败", details: errors }, { status: 400 });
    }

    return handler({ parsed: parsed.data });
  };
}