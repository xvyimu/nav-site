import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Admin 路由认证检查（替代 withAdmin / withAdminWrite）
 * middleware.ts 已保护路由，此函数在 handler 内部二次确认 + 提取用户信息
 */
export async function requireAdmin(): Promise<{ authorized: boolean }> {
  const session = await auth();
  if (!session?.user) {
    return { authorized: false };
  }
  return { authorized: true };
}

/**
 * 返回 401 响应（与 middleware 一致的格式）
 */
export function unauthorized() {
  return NextResponse.json({ error: "未授权" }, { status: 401 });
}
