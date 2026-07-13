"use client";

import { useCallback, useEffect, useState } from "react";
import type { NavLinkWithCategory, Category } from "@/lib/types";

export function useAdminLinks() {
  const [links, setLinks] = useState<NavLinkWithCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [linksRes, catsRes] = await Promise.all([
        fetch("/api/admin/links"),
        fetch("/api/admin/categories"),
      ]);

      if (!linksRes.ok) {
        const body = await linksRes.json().catch(() => ({}));
        setError(
          typeof body.error === "string"
            ? body.error
            : `加载链接失败 (${linksRes.status})`
        );
        // 失败时不把列表清空成「无数据」
        setLoading(false);
        return;
      }
      if (!catsRes.ok) {
        const body = await catsRes.json().catch(() => ({}));
        setError(
          typeof body.error === "string"
            ? body.error
            : `加载分类失败 (${catsRes.status})`
        );
        setLoading(false);
        return;
      }

      const linksData = await linksRes.json();
      const catsData = await catsRes.json();
      setLinks(linksData.links || []);
      setCategories(catsData.categories || []);
    } catch {
      setError("网络错误，无法加载管理数据");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 数据加载模式：组件挂载时拉取链接和分类
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  async function handleDelete(id: string, title: string) {
    if (!confirm(`确定删除「${title}」？`)) return;
    const res = await fetch(`/api/admin/links/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg =
        typeof body.error === "string" ? body.error : `删除失败 (${res.status})`;
      setError(msg);
      return;
    }
    await loadData();
  }

  return { links, categories, loading, error, loadData, handleDelete };
}
