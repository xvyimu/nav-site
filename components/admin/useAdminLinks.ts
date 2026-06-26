"use client";

import { useCallback, useEffect, useState } from "react";
import type { NavLinkWithCategory, Category } from "@/lib/types";

export function useAdminLinks() {
  const [links, setLinks] = useState<NavLinkWithCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const [linksRes, catsRes] = await Promise.all([
      fetch("/api/admin/links"),
      fetch("/api/admin/categories"),
    ]);
    if (linksRes.ok) {
      const d = await linksRes.json();
      setLinks(d.links || []);
    }
    if (catsRes.ok) {
      const d = await catsRes.json();
      setCategories(d.categories || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // 数据加载模式：组件挂载时拉取链接和分类
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  async function handleDelete(id: string, title: string) {
    if (!confirm(`确定删除「${title}」？`)) return;
    await fetch(`/api/admin/links/${id}`, { method: "DELETE" });
    loadData();
  }

  return { links, categories, loading, loadData, handleDelete };
}
