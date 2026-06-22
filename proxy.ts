import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default auth((req: NextRequest) => {
  const path = req.nextUrl.pathname;
  const isLoggedIn = !!(req as any).auth;
  const isAdminApi = path.startsWith("/api/admin/");
  const isAdminPage = path.startsWith("/admin");
  const isPublicApi = path.startsWith("/api/") && !isAdminApi;

  // 公开 API 直接放行
  if (isPublicApi) {
    return NextResponse.next();
  }

  // Admin 路由认证保护
  if ((isAdminApi || isAdminPage) && !isLoggedIn) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // 已登录用户访问登录页 → 重定向到管理面板
  if (path === "/login" && isLoggedIn) {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  // 请求日志（生产环境可禁用）
  if (process.env.NODE_ENV === "development" && path.startsWith("/api/")) {
    console.log(`[${req.method}] ${path}`);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/login"],
};
