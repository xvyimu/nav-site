/**
 * Next.js Client Instrumentation 文件
 *
 * Next.js 在浏览器端启动时自动加载本文件。
 * server / edge 端的 Sentry 初始化见 instrumentation.ts。
 *
 * 性能说明：Sentry 客户端初始化通过动态 import() + requestIdleCallback 延后，
 * 使 @sentry/nextjs (~110 KB gzip) 不进入首屏 JS bundle。
 * 代价：路由切换追踪丢失首几次导航，错误捕获延迟数百毫秒——对导航站可接受。
 * 详见 docs/perf/findings.md。
 */

// 延后初始化，引用在动态加载后设置
let _captureRouterTransitionStart: ((href: string, navigationType: string) => void) | null = null;

if (typeof window !== "undefined") {
  const loadSentry = () => {
    import("@sentry/nextjs").then(({ captureRouterTransitionStart, init }) => {
      init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        environment: process.env.NODE_ENV,
        release: `nav-site@${
          process.env.COMMIT_REF?.slice(0, 8) ||
          process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ||
          "dev"
        }`,

        // 采样率：生产环境 10%，够追踪到大多数问题
        tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

        // Session Replay 已关闭：该集成（含 rrweb 录制逻辑）是 client SDK 最大可选体积来源，
        // 在本项目（导航站，低交互复杂度）边际价值低。
        // 体积削减在 next.config.ts 的 bundleSizeOptimizations.excludeReplayShadowDom 等开关完成
        // （构建期 tree-shaking，运行时过滤无法减小 bundle）。详见 docs/perf/findings.md H7。

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

      _captureRouterTransitionStart = captureRouterTransitionStart;
    });
  };

  // 首屏渲染完成后加载，不阻塞关键渲染路径
  if ("requestIdleCallback" in window) {
    requestIdleCallback(loadSentry);
  } else {
    setTimeout(loadSentry, 1000);
  }
}

// 路由转换钩子：Sentry 加载前为空操作，加载后委托给 Sentry 实现。
// Sentry 加载前发生的路由转换不会被追踪——对导航站影响极小。
export const onRouterTransitionStart = (href: string, navigationType: string) => {
  _captureRouterTransitionStart?.(href, navigationType);
};
