/**
 * Next.js Instrumentation 文件
 *
 * 替代旧的 sentry.server.config.ts / sentry.edge.config.ts。
 * Next.js 在 server / edge runtime 启动时调用 register()，
 * 我们按 NEXT_RUNTIME 分别初始化对应的 Sentry 配置。
 *
 * server 与 edge 配置完全一致，统一复用 sentry.shared.config.ts。
 * client 配置见 instrumentation-client.ts（Next.js 自动加载）。
 */
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.shared.config");
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.shared.config");
  }
}

// 捕获嵌套 React Server Components 抛出的未处理错误。
// Next.js 在 app router 请求出错时调用此钩子。
export const onRequestError = Sentry.captureRequestError;
