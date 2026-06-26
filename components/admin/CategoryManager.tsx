"use client";

import { useState, useEffect, useCallback } from "react";
import type { Category } from "@/lib/types";

export function CategoryManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Category | null | undefined>(undefined);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    icon: "📁",
    sort_order: 0,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/categories");
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      }
    } catch {
      // 静默处理
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 数据加载模式：组件挂载时拉取分类列表
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  function resetForm() {
    setForm({ name: "", slug: "", description: "", icon: "📁", sort_order: 0 });
    setEditing(undefined);
  }

  function handleEdit(cat: Category) {
    setEditing(cat);
    setForm({
      name: cat.name,
      slug: cat.slug,
      description: cat.description || "",
      icon: cat.icon || "📁",
      sort_order: cat.sort_order,
    });
  }

  async function handleSave() {
    const payload = {
      name: form.name,
      slug: form.slug,
      description: form.description || null,
      icon: form.icon || "📁",
      sort_order: form.sort_order,
    };

    try {
      const url = editing
        ? `/api/admin/categories/${editing.id}`
        : "/api/admin/categories";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || err.details?.[0] || "保存失败");
        return;
      }

      resetForm();
      loadData();
    } catch {
      alert("网络错误，请重试");
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`确定删除分类「${name}」吗？该分类下的链接将变为未分类。`)) return;
    try {
      const res = await fetch(`/api/admin/categories/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "删除失败");
        return;
      }
      loadData();
    } catch {
      alert("网络错误，请重试");
    }
  }

  if (loading) return <p className="text-white/60">加载中...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">
          分类管理 <span className="text-sm font-normal text-white/40">({categories.length} 个)</span>
        </h2>
        <button
          onClick={() => { resetForm(); setEditing(null); }}
          className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400"
          aria-label="新增分类"
        >
          + 新增分类
        </button>
      </div>

      {editing !== undefined && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3">
          <h3 className="text-sm font-medium text-white/80">
            {editing ? "编辑分类" : "新增分类"}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <input
              className="field-input"
              placeholder="名称"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              className="field-input"
              placeholder="slug (小写字母+数字+连字符)"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
            />
            <input
              className="field-input"
              placeholder="图标 (emoji)"
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
            />
            <input
              className="field-input"
              type="number"
              placeholder="排序"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
            />
          </div>
          <input
            className="field-input w-full"
            placeholder="描述（可选）"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-400"
            >
              保存
            </button>
            <button
              onClick={resetForm}
              className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/60 transition hover:text-white"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {categories.map((cat) => (
          <div
            key={cat.id}
            className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">{cat.icon}</span>
              <div>
                <div className="text-sm font-medium text-white">{cat.name}</div>
                <div className="text-xs text-white/40">
                  {cat.slug} · 排序: {cat.sort_order}
                  {cat.description && ` · ${cat.description}`}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleEdit(cat)}
                className="rounded px-3 py-1 text-xs text-sky-400 transition hover:bg-sky-500/10"
              >
                编辑
              </button>
              <button
                onClick={() => handleDelete(cat.id, cat.name)}
                className="rounded px-3 py-1 text-xs text-red-400 transition hover:bg-red-500/10"
              >
                删除
              </button>
            </div>
          </div>
        ))}
        {categories.length === 0 && (
          <p className="text-center text-white/40 py-8">暂无分类</p>
        )}
      </div>
    </div>
  );
}
