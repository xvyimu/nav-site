"use client";

import { useEffect } from "react";

/**
 * pangu.js — 自动在中英文之间添加空格
 * 源项目: https://github.com/vinta/pangu.js
 */
export function PanguSpacing() {
  useEffect(() => {
    try {
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/pangu@4.0.7/dist/browser/pangu.min.js";
      script.onload = () => {
        const pangu = (window as any).pangu;
        if (pangu?.autoSpacingPage) {
          setTimeout(() => pangu.autoSpacingPage(), 500);
        }
      };
      document.head.appendChild(script);
    } catch {
      // 静默失败
    }
  }, []);

  return null;
}