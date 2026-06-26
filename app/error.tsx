"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import Link from "next/link";
import { Waves, RefreshCw, Home } from "lucide-react";

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
        <Waves className="h-10 w-10 text-muted-foreground/30" aria-hidden="true" />
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
            className="inline-flex items-center gap-1.5 rounded-full border border-input bg-background/80 px-4 py-2 text-sm text-foreground/70 transition-all hover:border-primary/60 hover:text-primary hover:bg-primary/5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            重试
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-input bg-background/80 px-4 py-2 text-sm text-foreground/70 transition-all hover:border-primary/60 hover:text-primary hover:bg-primary/5"
          >
            <Home className="h-3.5 w-3.5" />
            返回首页
          </Link>
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
