"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error("导航站全局错误:", error);
  }, [error]);

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
      <div className="flex flex-col items-center gap-5 text-center max-w-sm">
        <span className="text-4xl" role="img" aria-hidden="true">🌊</span>
        <h1 className="text-lg font-semibold text-foreground/80">
          页面遇到了问题
        </h1>
        <p className="text-sm text-muted-foreground/60 leading-relaxed">
          服务器暂时无法完成请求，可能是网络波动或临时故障。
          <br />
          你可以稍后重试，或者尝试刷新页面。
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => reset()}
            className="inline-flex items-center gap-1.5 rounded-full border border-input bg-background/80 px-4 py-2 text-sm text-foreground/70 transition-all hover:border-pink-300/60 hover:text-pink-500/80 hover:bg-pink-50/20 dark:hover:bg-pink-950/20"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            重试
          </button>
          <a
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-input bg-background/80 px-4 py-2 text-sm text-foreground/70 transition-all hover:border-pink-300/60 hover:text-pink-500/80 hover:bg-pink-50/20 dark:hover:bg-pink-950/20"
          >
            返回首页
          </a>
        </div>
        {error.digest && (
          <p className="text-[10px] text-muted-foreground/30 font-mono">
            错误编号: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
