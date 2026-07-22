import { auth } from "@/lib/auth";
import {
  CSP_NONCE_HEADER,
  createDynamicCspAttachment,
} from "@/lib/csp";
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextMiddleware, NextRequest } from "next/server";

/**
 * Admin auth gate + optional dynamic CSP / per-request nonce.
 *
 * Static CSP (default production path): next.config.ts + readCspFlags().
 * Dynamic path (preview only): set CSP_DYNAMIC=1 so next.config skips static
 * CSP headers; this proxy emits Enforcing (+ optional Report-Only) with nonce
 * and forwards `x-nonce` on the request for layout / next/script.
 *
 * Production default keeps CSP_DYNAMIC off — do not flip without preview canary.
 * See docs/csp-t9-decision-2026-07-22.md.
 */

function isDevEnv(): boolean {
  return process.env.NODE_ENV !== "production";
}

function needsAdminAuth(path: string): boolean {
  return (
    path.startsWith("/admin") ||
    path.startsWith("/api/admin/") ||
    path === "/login"
  );
}

/**
 * Attach dynamic CSP headers when CSP_DYNAMIC=1.
 * For passthrough `next()`, also inject request headers so Next can apply the nonce.
 */
function withDynamicCsp(
  req: NextRequest,
  response: NextResponse,
  opts: { asNext?: boolean } = {}
): NextResponse {
  const attachment = createDynamicCspAttachment(process.env, {
    isDev: isDevEnv(),
  });
  if (!attachment) return response;

  const { nonce, pairs } = attachment;

  if (opts.asNext) {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set(CSP_NONCE_HEADER, nonce);
    // Next extracts nonce from the request CSP header during SSR.
    for (const { key, value } of pairs) {
      requestHeaders.set(key, value);
    }
    const next = NextResponse.next({
      request: { headers: requestHeaders },
    });
    for (const { key, value } of pairs) {
      next.headers.set(key, value);
    }
    next.headers.set(CSP_NONCE_HEADER, nonce);
    return next;
  }

  for (const { key, value } of pairs) {
    response.headers.set(key, value);
  }
  response.headers.set(CSP_NONCE_HEADER, nonce);
  return response;
}

// next-auth overloads include AppRouteHandlerFn; pin NextMiddleware for proxy.
const adminAuthProxy = auth((req) => {
  const path = req.nextUrl.pathname;
  const isAdmin =
    (req.auth?.user as { role?: string } | undefined)?.role === "admin";
  const isAdminApi = path.startsWith("/api/admin/");
  const isAdminPage = path.startsWith("/admin");
  const isPublicApi = path.startsWith("/api/") && !isAdminApi;

  if (isPublicApi) {
    return withDynamicCsp(req, NextResponse.next(), { asNext: true });
  }

  if ((isAdminApi || isAdminPage) && !isAdmin) {
    if (path.startsWith("/api/")) {
      return withDynamicCsp(
        req,
        NextResponse.json({ error: "未授权" }, { status: 401 })
      );
    }
    return withDynamicCsp(
      req,
      NextResponse.redirect(new URL("/login", req.url))
    );
  }

  if (path === "/login" && isAdmin) {
    return withDynamicCsp(
      req,
      NextResponse.redirect(new URL("/admin", req.url))
    );
  }

  return withDynamicCsp(req, NextResponse.next(), { asNext: true });
}) as unknown as NextMiddleware;

/**
 * Next 16 `proxy` entry: admin auth on admin/login; optional CSP on documents.
 * When CSP_DYNAMIC=0, withDynamicCsp is a no-op → same as pre-T9″ static path.
 */
export default function proxy(req: NextRequest, event: NextFetchEvent) {
  const path = req.nextUrl.pathname;

  if (needsAdminAuth(path)) {
    return adminAuthProxy(req, event);
  }

  // Document routes only — no session work when outside admin/login.
  return withDynamicCsp(req, NextResponse.next(), { asNext: true });
}

export const config = {
  matcher: [
    // Admin auth gate (always)
    "/admin/:path*",
    "/api/admin/:path*",
    "/login",
    // HTML documents for optional dynamic CSP.
    // When CSP_DYNAMIC=0, withDynamicCsp returns the response unchanged (cheap no-op),
    // but the middleware still runs — keep DYNAMIC off in production.
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
