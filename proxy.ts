import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import {
  applyCspHeaderPairs,
  createDynamicCspContext,
  type DynamicCspContext,
} from "@/lib/csp";

type AuthUser = { role?: string } | undefined;

/**
 * Admin auth decision only (no CSP). Pure so unit tests cover redirects/401
 * without mounting NextAuth.
 */
export function resolveAdminGate(input: {
  pathname: string;
  isAdmin: boolean;
  url: string;
}): NextResponse | null {
  const { pathname, isAdmin, url } = input;
  const isAdminApi = pathname.startsWith("/api/admin/");
  const isAdminPage = pathname.startsWith("/admin");
  const isPublicApi = pathname.startsWith("/api/") && !isAdminApi;

  // 公开 API 直接放行（若 matcher 命中）
  if (isPublicApi) {
    return null;
  }

  // Admin 路由需要管理员权限
  if ((isAdminApi || isAdminPage) && !isAdmin) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", url));
  }

  // 已登录管理员访问登录页 → 重定向到管理面板
  if (pathname === "/login" && isAdmin) {
    return NextResponse.redirect(new URL("/admin", url));
  }

  return null;
}

/**
 * Attach dynamic CSP + request nonce when CSP_DYNAMIC=1.
 * - null gate → NextResponse.next with x-nonce request headers + CSP response headers
 * - redirect/json → CSP on response only (no layout)
 * - CSP_DYNAMIC off → passthrough (gate or next)
 */
export function finalizeProxyResponse(input: {
  gate: NextResponse | null;
  requestHeaders: Headers;
  /** Inject for tests; default reads env via createDynamicCspContext. */
  cspContext?: DynamicCspContext | null;
  createContext?: typeof createDynamicCspContext;
}): NextResponse {
  const createContext = input.createContext ?? createDynamicCspContext;
  const ctx =
    input.cspContext !== undefined
      ? input.cspContext
      : createContext({ requestHeaders: input.requestHeaders });

  if (!ctx) {
    return input.gate ?? NextResponse.next();
  }

  if (input.gate) {
    applyCspHeaderPairs(input.gate.headers, ctx.responseHeaderPairs);
    return input.gate;
  }

  const res = NextResponse.next({
    request: { headers: ctx.requestHeaders },
  });
  applyCspHeaderPairs(res.headers, ctx.responseHeaderPairs);
  return res;
}

/**
 * Admin auth gate + optional dynamic CSP (CSP_DYNAMIC=1).
 *
 * Static CSP (default production): next.config.ts + readCspFlags().
 * Dynamic path: lib/csp createDynamicCspContext → x-nonce + CSP headers;
 * layout consumes x-nonce (T9″). See docs/csp-t9-decision-2026-07-22.md.
 */
export default auth((req) => {
  const path = req.nextUrl.pathname;
  const isAdmin =
    (req.auth?.user as AuthUser)?.role === "admin";

  const gate = resolveAdminGate({
    pathname: path,
    isAdmin,
    url: req.url,
  });

  return finalizeProxyResponse({
    gate,
    requestHeaders: req.headers,
  });
});

/**
 * Document routes + admin API. Excludes static assets and non-admin APIs so
 * public JSON handlers stay outside the edge auth wrapper unless dynamic CSP
 * needs a page shell.
 */
export const config = {
  matcher: [
    "/api/admin/:path*",
    /*
     * All non-file document paths except other /api/* (admin API listed above).
     * Needed so CSP_DYNAMIC can stamp every HTML response with a nonce.
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
