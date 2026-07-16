/**
 * 共享工具函数
 *
 * 提取跨模块复用的通用工具，避免重复定义。
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * 为 Promise 添加超时限制
 * 在超时时间内未 resolve/reject，则 reject 超时错误
 */
export function withTimeout<T>(
  promise: Promise<T> | PromiseLike<T>,
  ms: number,
  message?: string
): Promise<T> {
  if (ms <= 0) return Promise.resolve(promise);

  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(message ?? `Timeout after ${ms}ms`));
      }, ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * 检查 URL 是否安全（仅允许 http/https 协议）
 *
 * 防止 javascript:、data: 等危险协议的 XSS 攻击。
 */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * 从 URL 中提取域名（去除 www. 前缀）
 */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * 获取客户端 IP 地址（限流用）
 *
 * 顺序（平台约定，优先不可被浏览器直接伪造的平台头）：
 * 1. Netlify `x-nf-client-connection-ip`
 * 2. Vercel `x-vercel-forwarded-for` 最左段（平台注入）
 * 3. 在 Vercel 上：`x-forwarded-for` **最右**段（平台追加的连接 IP）
 * 4. 非 Vercel：`x-real-ip`，再 `x-forwarded-for` 最左段（兼容本地/反代）
 *
 * 避免裸信任客户端自带的 XFF 首跳导致限流桶可被轮换伪造。
 */
export function getClientIp(request: Request): string {
  const nf = request.headers.get("x-nf-client-connection-ip")?.trim();
  if (nf) return nf;

  const vercelXff = request.headers.get("x-vercel-forwarded-for")?.trim();
  if (vercelXff) {
    const first = vercelXff.split(",")[0]?.trim();
    if (first) return first;
  }

  const onVercel =
    process.env.VERCEL === "1" ||
    Boolean(request.headers.get("x-vercel-id")?.trim()) ||
    Boolean(request.headers.get("x-vercel-deployment-url")?.trim());

  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (hops.length > 0) {
      // Vercel appends the connecting IP; leftmost may be client-spoofed.
      if (onVercel) return hops[hops.length - 1]!;
      return hops[0]!;
    }
  }

  if (!onVercel) {
    const realIp = request.headers.get("x-real-ip")?.trim();
    if (realIp) return realIp;
  }

  return "unknown";
}

/**
 * Favicon / 出站代理：是否应拒绝该 host（SSRF / 内网）
 */
export function isBlockedOutboundHost(domain: string): boolean {
  const host = domain.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".intranet") ||
    host === "metadata" ||
    host.endsWith(".metadata")
  ) {
    return true;
  }

  // 裸 IPv6 一律拒绝（favicon 无需）
  if (host.includes(":")) return true;

  // IPv4 私网 / 环回 / 链路本地 / 本网
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if ([a, b, Number(ipv4[3]), Number(ipv4[4])].some((n) => n > 255)) return true;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  return false;
}

/**
 * 对 JSON 字符串进行 HTML 实体转义，防止 XSS
 *
 * 在 dangerouslySetInnerHTML 中使用 JSON.stringify 结果时，
 * 必须转义 </script> 标签，防止攻击者注入恶意脚本。
 *
 * 注意：替换目标必须是字面量 "\\u003c" 这类六字符序列，
 * 而不是 Unicode 转义后的真实字符（否则等于 no-op）。
 */
export function escapeJsonForHtml(json: string): string {
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(new RegExp(String.fromCharCode(0x2028), "g"), "\\u2028")
    .replace(new RegExp(String.fromCharCode(0x2029), "g"), "\\u2029");
}
