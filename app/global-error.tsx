"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="flex flex-col items-center gap-5 text-center max-w-sm">
            <span className="text-4xl" role="img" aria-hidden="true">🌊</span>
            <h1 className="text-lg font-semibold text-foreground/80">
              发生了严重错误
            </h1>
            <p className="text-sm text-muted-foreground/60 leading-relaxed">
              服务器遇到了无法恢复的问题。
              <br />
              请稍后刷新页面重试。
            </p>
            <a
              href="/"
              className="inline-flex items-center gap-1.5 rounded-full border border-input bg-background/80 px-4 py-2 text-sm text-foreground/70 transition-all hover:border-pink-300/60 hover:text-pink-500/80 hover:bg-pink-50/20 dark:hover:bg-pink-950/20"
            >
              返回首页
            </a>
            {error.digest && (
              <p className="text-[10px] text-muted-foreground/30 font-mono">
                错误编号: {error.digest}
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}