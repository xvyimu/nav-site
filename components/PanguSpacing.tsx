"use client";

import { useEffect, useRef } from "react";

/**
 * pangu.js — 自动在中英文之间添加空格
 * 源项目: https://github.com/vinta/pangu.js
 * v7.2.1 本地依赖
 *
 * 架构说明：
 * pangu.js 的核心 API 是 `spacingPage()`，它遍历 DOM 文本节点并修改内容。
 * 这与 React 的虚拟 DOM 存在潜在冲突，但以下措施使此方案安全且高效：
 *
 * 1. 使用 requestAnimationFrame 在浏览器 paint 前执行，避免可见闪烁
 * 2. MutationObserver + 300ms debounce 处理动态渲染内容（搜索/筛选）
 * 3. pangu 仅修改文本节点（nodeValue），不改变 DOM 结构，不会破坏 React 事件绑定
 * 4. 相比渲染时处理（需包装所有文本组件），此方案零侵入性，性能开销可忽略
 *
 * 替代方案评估：
 * - React 文本包装组件：需重构所有展示组件，侵入性高，收益低
 * - CSS text-spacing 属性：浏览器兼容性不足（仅 Chrome 115+）
 * - 服务端渲染时处理：ISR 缓存命中率低，且 pangu 需浏览器环境
 */
export function PanguSpacing() {
  const rafId = useRef<number | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const { default: pangu } = await import("pangu/browser");

        function applySpacing() {
          if (cancelled) return;
          try {
            pangu.spacingPage();
          } catch {
            // 忽略个别节点的间距错误
          }
        }

        // 在 layout 阶段（浏览器 paint 之前）应用间距
        rafId.current = requestAnimationFrame(() => {
          if (!cancelled) {
            applySpacing();
          }
        });

        // 监听动态内容变化（如搜索、筛选、懒加载）
        // 使用 debounce 避免高频 DOM 变动导致性能问题
        const observer = new MutationObserver(() => {
          if (cancelled) return;
          if (debounceTimer.current) clearTimeout(debounceTimer.current);
          debounceTimer.current = setTimeout(() => {
            if (!cancelled) applySpacing();
          }, 300);
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });

        return () => {
          observer.disconnect();
          if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
      } catch (e) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[pangu]", e);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  return null;
}
