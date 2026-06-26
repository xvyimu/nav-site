import { createElement, type ReactNode } from "react";

/**
 * 搜索关键词高亮
 *
 * 将文本中匹配搜索词的部分用 <mark> 标签包裹，返回节点数组。
 * 大小写不敏感，自动转义正则特殊字符。
 */
export function highlightSearchTerm(text: string, query: string): ReactNode {
  if (!query || !query.trim()) return text;

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);

  if (parts.length === 1) return text;

  return parts.map((part, i) =>
    regex.test(part)
      ? createElement("mark", {
          key: i,
          className: "bg-primary/20 text-foreground rounded-sm px-0.5",
        }, part)
      : part,
  );
}