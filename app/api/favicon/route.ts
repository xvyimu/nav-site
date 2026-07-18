import { NextRequest, NextResponse } from "next/server";
import { createRequire } from "node:module";
import { faviconDomainSchema } from "@/lib/schemas";
import { checkDistributedRateLimit } from "@/lib/rate-limit-distributed";
import { getClientIp, isBlockedOutboundHost } from "@/lib/utils";

/**
 * Favicon 代理 API
 *
 * 降级顺序：
 * 1. favicon.cccyun.cc
 * 2. DuckDuckGo icons
 * 3. Google S2（跟随 redirect 到 gstatic）
 * 4. Google faviconV2 直链
 * 5. 域名首字母 SVG 占位（始终 200，避免前端 Globe 闪烁与 404 噪音）
 *
 * 安全：只请求固定 CDN 模板，禁止直连用户域名（防 SSRF）。
 * 上游 404 但 body 仍是 image/* 时也会接受（DDG/Google 常见）。
 */

const FAVICON_PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
let proxyDispatcher: unknown;
let proxyInitialized = false;

const FAVICON_WINDOW_MS = 60_000;
const FAVICON_MAX_PER_MIN = 120;
const MAX_BODY_BYTES = 512 * 1024;
/** 过小几乎一定是空壳/错误页；真实 16x16 png 也常 > 80B */
const MIN_BODY_BYTES = 64;
const UPSTREAM_TIMEOUT_MS = 3500;
/** Google 无图标时的通用占位约 726B；DDG 无图标约 1478B */
const PLACEHOLDER_BODY_SIZES = new Set([726, 1478]);

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
    // already closed
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
  if (PLACEHOLDER_BODY_SIZES.has(total)) throw new Error("favicon_placeholder_body");

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

/**
 * 从固定 CDN 拉图标。接受 200 或「404 + image/* + 非占位 body」
 *（上游常用 404 表示 default icon，但 body 仍是 png）。
 */
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
      headers: {
        "User-Agent": "nav-site-favicon-proxy/1.1",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      // 跟随 CDN 内部跳转（如 Google → gstatic）；起点已是白名单 CDN
      redirect: "follow",
      ...dispatcherOption,
    });

    const contentType = response.headers.get("content-type") || "";
    const isImage = contentType.startsWith("image/");
    const statusOk = response.status >= 200 && response.status < 300;
    const softNotFoundImage = response.status === 404 && isImage;

    if ((!statusOk && !softNotFoundImage) || !isImage) {
      await cancelBody(response);
      throw new Error("favicon_upstream_invalid_response");
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) {
      await cancelBody(response);
      throw new Error("favicon_body_too_large");
    }

    return {
      body: await readBodyWithinLimit(response),
      contentType: contentType.split(";")[0]?.trim() || "image/png",
      label: source.label,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** 用域名首字母生成 SVG 占位，保证始终有图标可显示。 */
function buildMonogramSvg(domain: string): Uint8Array {
  const label = (domain.replace(/^www\./, "").charAt(0) || "?").toUpperCase();
  // 简单色相：按首字符稳定取色，避免每次随机
  const hue = (label.charCodeAt(0) * 37) % 360;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="${label}">
  <rect width="64" height="64" rx="14" fill="hsl(${hue} 42% 46%)"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
    font-family="ui-sans-serif,system-ui,sans-serif" font-size="32" font-weight="700"
    fill="#fff">${label}</text>
</svg>`;
  return new TextEncoder().encode(svg);
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

  const domainCheck = faviconDomainSchema.safeParse(domain);
  if (!domainCheck.success) {
    const firstError = domainCheck.error.flatten().formErrors[0] || "Invalid domain";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const safeDomain = domainCheck.data;
  if (isBlockedOutboundHost(safeDomain)) {
    return NextResponse.json({ error: "Domain not allowed" }, { status: 400 });
  }

  const dispatcherOption = await getProxyDispatcher();

  // 仅固定 CDN 模板；禁止 `https://${userDomain}/favicon.ico`
  const sources: FaviconSource[] = [
    { url: `https://favicon.cccyun.cc/${safeDomain}`, label: "cccyun" },
    { url: `https://icons.duckduckgo.com/ip3/${safeDomain}.ico`, label: "duckduckgo" },
    {
      url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(safeDomain)}&sz=64`,
      label: "google-s2",
    },
    {
      url: `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(`http://${safeDomain}`)}&size=64`,
      label: "google-v2",
    },
  ];

  const controllers: AbortController[] = [];
  try {
    const result = await Promise.any(
      sources.map((source) => fetchFaviconSource(source, dispatcherOption, controllers))
    );

    return new NextResponse(Buffer.from(result.body), {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
        "X-Favicon-Source": result.label,
      },
    });
  } catch {
    // all CDN sources failed
  } finally {
    for (const controller of controllers) controller.abort();
  }

  // SVG 字母占位：200 + 长缓存，客户端不再 Globe / 404 风暴
  const monogram = buildMonogramSvg(safeDomain);
  return new NextResponse(Buffer.from(monogram), {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "X-Favicon-Source": "monogram",
    },
  });
}
