"use client";

import { useEffect, useState } from "react";
import { Category } from "@/lib/types";

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", description: "", icon: "📁", sort_order: 0 });

  async function loadData() {
    const res = await fetch("/api/admin/categories");
    if (res.ok) {
      const d = await res.json();
      setCategories(d.categories || []);
    }
    setLoading(false);
  }

  useEffect(() => { loadData(); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  function resetForm() {
    setForm({ name: "", slug: "", description: "", icon: "📁", sort_order: 0 });
    setEditingId(null);
    setShowForm(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = editingId ? `/api/admin/categories/${editingId}` : "/api/admin/categories";
    const method = editingId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      resetForm();
      loadData();
    } else {
      const d = await res.json();
      alert(d.error || "操作失败");
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`确定删除分类「${name}」？分类下的链接不会自动删除，但会变成「未分类」。`)) return;
    const res = await fetch(`/api/admin/categories/${id}`, { method: "DELETE" });
    if (res.ok) loadData();
  }

  function startEdit(cat: Category) {
    setForm({ name: cat.name, slug: cat.slug, description: cat.description || "", icon: cat.icon || "📁", sort_order: cat.sort_order });
    setEditingId(cat.id);
    setShowForm(true);
  }

  if (loading) return <p className="text-white/60">加载中...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">
          分类管理 <span className="text-sm font-normal text-white/40">({categories.length} 个)</span>
        </h2>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400"
        >
          + 新增分类
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
          <h3 className="font-medium text-white">{editingId ? "编辑分类" : "新增分类"}</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-white/50">名称 *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-white outline-none focus:border-sky-400 text-sm" required />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">Slug *（英文标识，如 free-relay）</label>
              <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-white outline-none focus:border-sky-400 text-sm" required />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">描述</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-white outline-none focus:border-sky-400 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">图标</label>
              <input value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-white outline-none focus:border-sky-400 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">排序（数字越小越靠前）</label>
              <input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-white outline-none focus:border-sky-400 text-sm" />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400">
              {editingId ? "保存" : "添加"}
            </button>
            <button type="button" onClick={resetForm} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white/60 transition hover:bg-white/20">
              取消
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {categories.map(cat => (
          <div key={cat.id}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition hover:bg-white/[0.08]"
          >
            <span className="text-2xl">{cat.icon || "📁"}</span>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-white">{cat.name}</div>
              <div className="text-xs text-white/40">
                <span>/admin?cat={cat.slug}</span>
                <span className="mx-2">·</span>
                <span>排序 {cat.sort_order}</span>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button onClick={() => startEdit(cat)}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/60 transition hover:bg-white/20 hover:text-white">
                编辑
              </button>
              <button onClick={() => handleDelete(cat.id, cat.name)}
                className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-400 transition hover:bg-red-500/20">
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}