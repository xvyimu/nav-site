/**
 * Sentry 共享配置
 *
 * server 和 edge 配置完全一致，提取至此文件避免重复。
 * client 配置因包含 beforeSend 过滤和 replay 设置，保持独立。
 */

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: `nav-site@${
    process.env.COMMIT_REF?.slice(0, 8) ||
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ||
    "dev"
  }`,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
});
