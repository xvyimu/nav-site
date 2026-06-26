import { NextRequest, NextResponse } from "next/server";

/**
 * Favicon 代理 API
 *
 * 三级降级策略：
 * 1. favicon.im (主源，Cloudflare 加速)
 * 2. Google S2 (备用)
 * 3. 返回 404 让客户端显示 Globe 图标
 *
 * 带服务端缓存头，减少重复请求。
 *
 * 用法：/api/favicon?domain=example.com
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get("domain");

  if (!domain) {
    return NextResponse.json({ error: "Missing domain parameter" }, { status: 400 });
  }

  // 验证域名格式
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!domainRegex.test(domain)) {
    return NextResponse.json({ error: "Invalid domain" }, { status: 400 });
  }

  const sources = [
    `https://favicon.im/${domain}`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
  ];

  for (const url of sources) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(url, {
        signal: controller.signal,
        redirect: "manual",
        headers: { "User-Agent": "nav-site-favicon-proxy/1.0" },
      });

      clearTimeout(timer);

      if (res.ok) {
        const contentType = res.headers.get("content-type") || "";
        // 仅放行 image/* 类型，防止非图片内容透传
        if (!contentType.startsWith("image/")) {
          continue;
        }
        const buffer = await res.arrayBuffer();

        return new NextResponse(buffer, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=86400, s-maxage=604800",
            "X-Favicon-Source": url.includes("favicon.im") ? "favicon.im" : "google-s2",
          },
        });
      }
    } catch {
      // 继续尝试下一个源
    }
  }

  // 所有源都失败 — 返回 404，客户端显示 Globe 图标
  return new NextResponse(null, { status: 404 });
}
