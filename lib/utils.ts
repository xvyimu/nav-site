/**
 * 共享工具函数
 *
 * 提取跨模块复用的通用工具，避免重复定义。
 */

type ClassValue = string | number | false | null | undefined | ClassDictionary | ClassArray;
type ClassDictionary = Record<string, boolean | null | undefined>;
type ClassArray = ClassValue[];

export function cn(...inputs: ClassValue[]): string {
  const classes: string[] = [];

  for (const input of inputs) {
    if (!input) continue;

    if (typeof input === "string" || typeof input === "number") {
      classes.push(String(input));
      continue;
    }

    if (Array.isArray(input)) {
      const value = cn(...input);
      if (value) classes.push(value);
      continue;
    }

    for (const [key, value] of Object.entries(input)) {
      if (value) classes.push(key);
    }
  }

  return classes.join(" ");
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
