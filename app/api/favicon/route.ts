import { NextRequest, NextResponse } from "next/server";
import { createRequire } from "node:module";
import { faviconDomainSchema } from "@/lib/schemas";
import { checkDistributedRateLimit } from "@/lib/rate-limit-distributed";
import { getClientIp, isBlockedOutboundHost } from "@/lib/utils";

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

const FAVICON_WINDOW_MS = 60_000;
const FAVICON_MAX_PER_MIN = 120;

export const runtime = "nodejs";

/** 懒加载代理 dispatcher（仅当配置了 HTTPS_PROXY 时启用） */
async function getProxyDispatcher(): Promise<{ dispatcher?: unknown }> {
  if (!FAVICON_PROXY) return {};
  if (!proxyInitialized) {
    proxyInitialized = true;
    try {
      const require = createRequire(import.meta.url);
      const mod = require("undici") as {
        ProxyAgent: new (proxy: string) => unknown;
      };
      proxyDispatcher = new mod.ProxyAgent(FAVICON_PROXY);
    } catch {
      proxyDispatcher = undefined;
    }
  }
  return proxyDispatcher ? { dispatcher: proxyDispatcher } : {};
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const { allowed } = await checkDistributedRateLimit(
    `favicon:${ip}`,
    FAVICON_WINDOW_MS,
    FAVICON_MAX_PER_MIN
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "请求过于频繁" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

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

  if (isBlockedOutboundHost(domainCheck.data)) {
    return NextResponse.json({ error: "Domain not allowed" }, { status: 400 });
  }

  const dispatcherOption = await getProxyDispatcher();

  // 仅走第三方 icon CDN，禁止 direct fetch(用户域名) 以消除 redirect/DNS SSRF 面。
  const sources = [
    { url: `https://favicon.cccyun.cc/${domain}`, label: "cccyun" },
    { url: `https://icons.duckduckgo.com/ip3/${domain}.ico`, label: "duckduckgo" },
    { url: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`, label: "google-s2" },
  ];

  const MAX_BODY_BYTES = 512 * 1024;

  for (const { url, label } of sources) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "nav-site-favicon-proxy/1.0" },
        redirect: "manual",
        ...dispatcherOption,
      });

      // 不跟随跨源 3xx（CDN 偶发 302 时跳过该源）
      if (res.status >= 300 && res.status < 400) {
        continue;
      }

      if (res.ok) {
        const contentType = res.headers.get("content-type") || "";
        // 仅放行 image/* 类型，防止非图片内容透传
        if (!contentType.startsWith("image/")) {
          continue;
        }
        const contentLength = Number(res.headers.get("content-length") || 0);
        if (contentLength > MAX_BODY_BYTES) {
          continue;
        }
        // 跳过过小的响应（通常是占位图或错误图标）
        const buffer = await res.arrayBuffer();
        if (buffer.byteLength < 100 || buffer.byteLength > MAX_BODY_BYTES) {
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
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // 所有源都失败 — 返回 404，客户端显示 Globe 图标
  return new NextResponse(null, {
    status: 404,
    headers: {
      // 短负缓存，减轻失败重试风暴
      "Cache-Control": "public, max-age=600, s-maxage=600",
    },
  });
}
