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
const MAX_BODY_BYTES = 512 * 1024;
const MIN_BODY_BYTES = 100;
const UPSTREAM_TIMEOUT_MS = 3000;

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

async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The body may already be closed or aborted.
  }
}

async function readBodyWithinLimit(response: Response): Promise<Uint8Array> {
  if (!response.body) throw new Error("favicon_body_missing");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel("favicon_body_too_large");
        throw new Error("favicon_body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (total < MIN_BODY_BYTES) throw new Error("favicon_body_too_small");

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

interface FaviconSource {
  url: string;
  label: string;
}

async function fetchFaviconSource(
  source: FaviconSource,
  dispatcherOption: { dispatcher?: unknown },
  controllers: AbortController[]
): Promise<{ body: Uint8Array; contentType: string; label: string }> {
  const controller = new AbortController();
  controllers.push(controller);
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: { "User-Agent": "nav-site-favicon-proxy/1.0" },
      redirect: "manual",
      ...dispatcherOption,
    });

    if (!response.ok || (response.status >= 300 && response.status < 400)) {
      await cancelBody(response);
      throw new Error("favicon_upstream_invalid_status");
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      await cancelBody(response);
      throw new Error("favicon_upstream_invalid_type");
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) {
      await cancelBody(response);
      throw new Error("favicon_body_too_large");
    }

    return {
      body: await readBodyWithinLimit(response),
      contentType,
      label: source.label,
    };
  } finally {
    clearTimeout(timer);
  }
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

  const controllers: AbortController[] = [];
  try {
    const result = await Promise.any(
      sources.map((source) => fetchFaviconSource(source, dispatcherOption, controllers))
    );

    return new NextResponse(result.body, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
        "X-Favicon-Source": result.label,
      },
    });
  } catch {
    // All fixed upstream sources failed validation or timed out.
  } finally {
    for (const controller of controllers) controller.abort();
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
