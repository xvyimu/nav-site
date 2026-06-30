"use client";

import { useReportWebVitals } from "next/web-vitals";
import { useCallback } from "react";

/**
 * Web Vitals 上报组件
 *
 * 使用 Next.js 内置的 useReportWebVitals hook，
 * 通过 sendBeacon 上报到 /api/web-vitals，由后端写入 Sentry。
 *
 * 组件本身不渲染任何 DOM，仅注册性能监听。
 * 放在 RootLayout 中 ThemeProvider 内首位，确保最早注册。
 *
 * 详见 docs/superpowers/specs/2026-06-29-performance-optimization-design.md §3.1 管线 B
 */
export function WebVitals() {
  const handleWebVitals = useCallback((metric: { id: string; name: string; value: number; rating: string; delta: number; navigationType: string }) => {
    if (typeof navigator === "undefined") return;
    const body = JSON.stringify(metric);
    // 优先 sendBeacon（不阻塞页面卸载），降级到 fetch keepalive
    if (typeof navigator.sendBeacon === "function") {
      try {
        navigator.sendBeacon("/api/web-vitals", new Blob([body], { type: "application/json" }));
        return;
      } catch {
        // sendBeacon 失败时降级到 fetch
      }
    }
    fetch("/api/web-vitals", { body, method: "POST", keepalive: true }).catch(() => {
      // 静默失败，性能上报不应影响业务
    });
  }, []);

  useReportWebVitals(handleWebVitals);
  return null;
}
