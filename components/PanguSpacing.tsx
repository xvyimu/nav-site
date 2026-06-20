"use client";

import { useEffect } from "react";

/**
 * pangu.js — 自动在中英文之间添加空格
 * 源项目: https://github.com/vinta/pangu.js
 * v7.2.1 本地依赖，替代旧的 CDN 引用
 */
export function PanguSpacing() {
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const { default: pangu } = await import("pangu/browser");
        if (!cancelled) {
          pangu.spacingPage();
        }
      } catch (e) {
        // pangu 非关键依赖，失败时仅打印 debug 信息
        if (process.env.NODE_ENV === "development") {
          console.warn("[pangu]", e);
        }
      }
    }

    // 延迟执行，等 DOM 渲染完成
    const timer = setTimeout(init, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return null;
}