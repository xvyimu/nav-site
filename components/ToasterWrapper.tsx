"use client";

import dynamic from "next/dynamic";

/**
 * 客户端 Toaster 包装组件
 *
 * `ssr: false` 使 sonner 库不进入首屏 JS bundle：
 * sonner 仅在有 toast 通知时按需加载，不在服务端渲染。
 * 警告：不能直接在 app/layout.tsx（Server Component）中使用 `{ ssr: false }`，
 * 因此移到此客户端模块。
 */
const Toaster = dynamic(
  () => import("@/components/ui/sonner").then((m) => m.Toaster),
  { ssr: false },
);

export function ToasterWrapper() {
  return <Toaster position="top-center" />;
}