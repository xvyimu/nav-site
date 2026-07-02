import { NextRequest, NextResponse } from "next/server";
import { faviconDomainSchema } from "@/lib/schemas";

/**
 * Favicon 代理 API
 *
 * 四级降级策略（按国内可达性排序）：
 * 1. favicon.cccyun.cc（主源，国内访问稳定）
 * 2. DuckDuckGo icon 服务（备用，国内偶尔超时）
 * 3. Google S2（备用，国内偶尔超时）
 * 4. 直接取目标域名 /favicon.ico（最终兜底）
 * 5. 返回 404 让客户端显示 Globe 图标
 *
 * 单源超时 3s，避免长尾请求拖慢页面。
 * 带服务端缓存头，减少重复请求。
 *
 * 本地开发：若设置了 HTTPS_PROXY / HTTP_PROXY 环境变量
 * （如 http://127.0.0.1:7897），将自动通过代理访问外部图标源，
 * 解决 Node.js fetch 默认不走系统代理的问题。
 *
 * 用法：/api/favicon?domain=example.com
 */

const FAVICON_PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
let proxyDispatcher: unknown;
let proxyInitialized = false;

/** 懒加载代理 dispatcher（仅当配置了 HTTPS_PROXY 时启用） */
async function getProxyDispatcher(): Promise<{ dispatcher?: unknown }> {
  if (!FAVICON_PROXY) return {};
  if (!proxyInitialized) {
    proxyInitialized = true;
    try {
      // undici 是 Node.js 18+ 内置模块，运行时一定可用；
      // 无独立 @types 声明，用 @ts-expect-error 绕过 TS2307
      // @ts-expect-error - Node 内置模块无类型声明
      const mod = await import("undici");
      proxyDispatcher = new mod.ProxyAgent(FAVICON_PROXY);
    } catch {
      proxyDispatcher = undefined;
    }
  }
  return proxyDispatcher ? { dispatcher: proxyDispatcher } : {};
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const domain = searchParams.get("domain");

  if (!domain) {
    return NextResponse.json({ error: "Missing domain parameter" }, { status: 400 });
  }

  // Zod 域名格式校验（替换原手动正则）
  const domainCheck = faviconDomainSchema.safeParse(domain);
  if (!domainCheck.success) {
    const firstError = domainCheck.error.flatten().formErrors[0] || "Invalid domain";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const dispatcherOption = await getProxyDispatcher();

  const sources = [
    { url: `https://favicon.cccyun.cc/${domain}`, label: "cccyun" },
    { url: `https://icons.duckduckgo.com/ip3/${domain}.ico`, label: "duckduckgo" },
    { url: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`, label: "google-s2" },
    { url: `https://${domain}/favicon.ico`, label: "direct" },
  ];

  for (const { url, label } of sources) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "nav-site-favicon-proxy/1.0" },
        ...dispatcherOption,
      });

      clearTimeout(timer);

      if (res.ok) {
        const contentType = res.headers.get("content-type") || "";
        // 仅放行 image/* 类型，防止非图片内容透传
        if (!contentType.startsWith("image/")) {
          continue;
        }
        // 跳过过小的响应（通常是占位图或错误图标）
        const buffer = await res.arrayBuffer();
        if (buffer.byteLength < 100) {
          continue;
        }

        return new NextResponse(buffer, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=86400, s-maxage=604800",
            "X-Favicon-Source": label,
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
