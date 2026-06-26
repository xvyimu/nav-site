import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://www.google.com https://www.google-analytics.com",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "connect-src 'self' https://*.supabase.co https://*.ingest.us.sentry.io https://www.google-analytics.com https://region1.google-analytics.com",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // NOTE: Turbopack is disabled due to NTFS reparse point issue in node_modules.
  // 30 top-level package directories have leftover pnpm junction reparse points
  // that Turbopack cannot traverse. Use `next build --webpack` and `next dev --webpack`.
  // See CLAUDE-HANDOFF.md for details.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default withBundleAnalyzer(
  withSentryConfig(nextConfig, {
    org: "yuanjia-m0",
    project: "javascript-nextjs",
    silent: !process.env.CI,
    widenClientFileUpload: true,
    sourcemaps: { disable: false },
    // Turbopack 不支持以下选项，可忽略
    // disableLogger / automaticVercelMonitors 已废弃
  })
);
