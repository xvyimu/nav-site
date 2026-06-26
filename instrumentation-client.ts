/**
 * Next.js Client Instrumentation 文件
 *
 * 替代旧的 sentry.client.config.ts。Next.js 在浏览器端启动时自动加载本文件。
 * server / edge 端的 Sentry 初始化见 instrumentation.ts。
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: `nav-site@${
    process.env.COMMIT_REF?.slice(0, 8) ||
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ||
    "dev"
  }`,

  // 采样率：生产环境 10%，够追踪到大多数问题
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Session replay：仅在报错时录制
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  // 过滤已知噪音，减少 Sentry 配额浪费
  beforeSend(event) {
    const ignorePatterns = [
      "ResizeObserver loop",
      "Non-Error promise rejection captured",
      "Hydration failed",
      "Text content does not match server-rendered HTML",
    ];

    const message = event.message || "";
    const values = event.exception?.values?.[0]?.value || "";

    for (const pattern of ignorePatterns) {
      if (message.includes(pattern) || values.includes(pattern)) {
        return null;
      }
    }

    return event;
  },
});

// Sentry SDK 要求：导出此钩子以插桩 App Router 的路由切换。
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
