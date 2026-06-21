"use client";

import { useEffect, useState } from "react";
import { NavLinkWithCategory, Category } from "@/lib/types";

export default function AdminPage() {
  const [links, setLinks] = useState<NavLinkWithCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // 表单
  const [form, setForm] = useState({
    title: "",
    url: "",
    description: "",
    icon: "🔗",
    category_id: "",
    approved: true,
    featured: false,
  });

  async function loadData() {
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
  }

  useEffect(() => { loadData(); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  function resetForm() {
    setForm({ title: "", url: "", description: "", icon: "🔗", category_id: categories[0]?.id || "", approved: true, featured: false });
    setEditingId(null);
    setShowForm(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = editingId ? `/api/admin/links/${editingId}` : "/api/admin/links";
    const method = editingId ? "PUT" : "POST";

    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (res.ok) {
      resetForm();
      loadData();
    } else {
      const d = await res.json();
      alert(d.error || "操作失败");
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`确定删除「${title}」？`)) return;
    const res = await fetch(`/api/admin/links/${id}`, { method: "DELETE" });
    if (res.ok) loadData();
  }

  function startEdit(link: NavLinkWithCategory) {
    setForm({
      title: link.title,
      url: link.url,
      description: link.description || "",
      icon: link.icon || "🔗",
      category_id: link.category_id || "",
      approved: link.approved,
      featured: link.featured,
    });
    setEditingId(link.id);
    setShowForm(true);
  }

  if (loading) return <p className="text-white/60">加载中...</p>;

  return (
    <div className="space-y-6">
      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">
          链接管理 <span className="text-sm font-normal text-white/40">({links.length} 条)</span>
        </h2>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400"
        >
          + 新增链接
        </button>
      </div>

      {/* 新增/编辑表单 */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
          <h3 className="font-medium text-white">{editingId ? "编辑链接" : "新增链接"}</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-white/50">标题 *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-white outline-none focus:border-sky-400 text-sm" required />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">URL *</label>
              <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
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
              <label className="mb-1 block text-xs text-white/50">分类</label>
              <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-white outline-none focus:border-sky-400 text-sm">
                <option value="">无分类</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex items-end gap-4">
              <label className="flex items-center gap-2 text-sm text-white/70">
                <input type="checkbox" checked={form.approved} onChange={e => setForm(f => ({ ...f, approved: e.target.checked }))}
                  className="accent-sky-500" />
                已审核
              </label>
              <label className="flex items-center gap-2 text-sm text-white/70">
                <input type="checkbox" checked={form.featured} onChange={e => setForm(f => ({ ...f, featured: e.target.checked }))}
                  className="accent-sky-500" />
                推荐
              </label>
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

      {/* 链接列表 */}
      <div className="space-y-2">
        {links.map(link => (
          <div key={link.id}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition hover:bg-white/[0.08]"
          >
            <span className="text-lg">{link.icon || "🔗"}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-white">{link.title}</span>
                {!link.approved && <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] text-yellow-400">待审</span>}
                {link.featured && <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] text-purple-400">推荐</span>}
              </div>
              <div className="flex items-center gap-3 text-xs text-white/40">
                <span className="truncate">{link.url}</span>
                <span>{link.nav_categories?.name || "未分类"}</span>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button onClick={() => startEdit(link)}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/60 transition hover:bg-white/20 hover:text-white">
                编辑
              </button>
              <button onClick={() => handleDelete(link.id, link.title)}
                className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-400 transition hover:bg-red-500/20">
                删除
              </button>
            </div>
          </div>
        ))}
        {links.length === 0 && (
          <p className="py-12 text-center text-white/30">暂无链接</p>
        )}
      </div>
    </div>
  );
}