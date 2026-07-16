"use client";

import { useLayoutEffect, useRef } from "react";
import pangu from "pangu/browser";

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
 * 性能优化（H1 修复，2026-06-30）：
 * - 初始挂载：scope 到 #atlas 子树而非 document.body，减少遍历节点数
 * - MutationObserver：监听 #main-content 而非 document.body，并合并父子 target，
 *   用 spacingNode(el) 限定遍历范围，避免外围 UI 变化和重复子树扫描
 * - performance.mark/measure 量化每次执行耗时，>50ms 时 emit console.warn
 *
 * 替代方案评估：
 * - React 文本包装组件：需重构所有展示组件，侵入性高，收益低
 * - CSS text-spacing 属性：浏览器兼容性不足（仅 Chrome 115+）
 * - 服务端渲染时处理：ISR 缓存命中率低，且 pangu 需浏览器环境
 */
export function PanguSpacing() {
  const rafId = useRef<number | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTargets = useRef<Set<Element>>(new Set());

  useLayoutEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | null = null;

    try {

        function getObserverRoot() {
          return (
            document.getElementById("main-content") ||
            document.getElementById("atlas") ||
            document.body
          );
        }

        function getInitialTarget() {
          return document.getElementById("atlas") || getObserverRoot();
        }

        function queueSpacingTarget(root: Element, target: Element) {
          if (!target.isConnected || !root.contains(target)) return;

          for (const existing of pendingTargets.current) {
            if (existing === target || existing.contains(target)) {
              return;
            }
            if (target.contains(existing)) {
              pendingTargets.current.delete(existing);
            }
          }

          pendingTargets.current.add(target);
        }

        /**
         * 限定 scope 的 spacingNode 替代全量 spacingPage
         *
         * @param targets - 需要遍历的子树根集合；空集表示首次挂载，优先 scope 到 #atlas
         */
        function applySpacing(targets?: Set<Element>) {
          if (cancelled) return;
          const label = `pangu-spacing-${targets ? "mutation" : "init"}`;
          try {
            performance.mark(`${label}-start`);

            if (targets && targets.size > 0) {
              for (const el of targets) {
                if (el.isConnected) {
                  pangu.spacingNode(el);
                }
              }
            } else {
              pangu.spacingNode(getInitialTarget());
            }

            performance.mark(`${label}-end`);
            performance.measure(label, `${label}-start`, `${label}-end`);
            const measure = performance.getEntriesByName(label).at(-1);
            if (process.env.NODE_ENV === "development" && measure && measure.duration > 50) {
              console.warn(
                `[pangu] ${label} took ${measure.duration.toFixed(1)}ms (>50ms threshold)`
              );
            }
          } catch {
            // 忽略个别节点的间距错误
          } finally {
            performance.clearMarks(`${label}-start`);
            performance.clearMarks(`${label}-end`);
            performance.clearMeasures(label);
          }
        }

        // 初始挂载：在 layout 阶段（浏览器 paint 之前）应用间距
        rafId.current = requestAnimationFrame(() => {
          if (!cancelled) {
            applySpacing();
          }
        });

        // 监听动态内容变化（如搜索、筛选、路由切换），限定到主内容区。
        observer = new MutationObserver((mutations) => {
          if (cancelled) return;
          const root = getObserverRoot();

          for (const m of mutations) {
            if (m.addedNodes.length === 0) continue;

            if (m.target instanceof Element && m.target !== root) {
              queueSpacingTarget(root, m.target);
              continue;
            }

            for (const node of m.addedNodes) {
              if (node instanceof Element) {
                queueSpacingTarget(root, node);
              }
            }
          }

          if (pendingTargets.current.size === 0) return;

          if (debounceTimer.current) clearTimeout(debounceTimer.current);
          debounceTimer.current = setTimeout(() => {
            if (!cancelled) {
              const targets = new Set(pendingTargets.current);
              pendingTargets.current.clear();
              applySpacing(targets);
            }
          }, 300);
        });

        observer.observe(getObserverRoot(), {
          childList: true,
          subtree: true,
        });
      } catch (e) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[pangu]", e);
        }
      }

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      pendingTargets.current.clear();
    };
  }, []);

  return null;
}
