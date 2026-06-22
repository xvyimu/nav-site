import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 采样率：生产环境 10%，够追踪到大多数问题
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Session replay：仅在报错时录制
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
});