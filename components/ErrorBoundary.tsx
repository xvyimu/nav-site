"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * React Error Boundary — 捕获子组件渲染错误并上报 Sentry
 *
 * 用于包裹可能出错的组件区域（如第三方嵌入、复杂交互组件），
 * 防止单个组件崩溃导致整页白屏。
 *
 * 性能说明：captureException 使用动态 import()，使 @sentry/nextjs
 * 不进入首页 bundle（~110 KB 节省）。
 * 仅在 ErrorBoundary 实际捕获错误时才会加载 Sentry 模块。
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // 动态导入避免 @sentry/nextjs 进入首屏 bundle
    import("@sentry/nextjs").then(({ captureException }) => {
      captureException(error, {
        contexts: {
          react: {
            componentStack: errorInfo.componentStack,
          },
        },
        tags: {
          source: "error-boundary",
        },
      });
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            此区域加载失败，请刷新页面重试
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="rounded-md border border-border px-4 py-2 text-sm transition-colors hover:bg-muted"
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
