/**
 * 共享工具函数
 *
 * 提取跨模块复用的通用工具，避免重复定义。
 */

/**
 * 为 Promise 添加超时限制
 * 在超时时间内未 resolve/reject，则 reject 超时错误
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T> {
  if (ms <= 0) return promise;

  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      const id = setTimeout(() => {
        clearTimeout(id);
        reject(new Error(message ?? `Timeout after ${ms}ms`));
      }, ms);
      // 保持 Node.js 事件循环活跃（setTimeout 默认会保持，无需额外操作）
    }),
  ]);
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
 * 获取客户端 IP 地址
 * 优先使用 Netlify 的 x-nf-client-connection-ip，其次 x-forwarded-for
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-nf-client-connection-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/**
 * 对 JSON 字符串进行 HTML 实体转义，防止 XSS
 *
 * 在 dangerouslySetInnerHTML 中使用 JSON.stringify 结果时，
 * 必须转义 </script> 标签，防止攻击者注入恶意脚本。
 */
export function escapeJsonForHtml(json: string): string {
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
