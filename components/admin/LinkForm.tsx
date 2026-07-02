"use client";

import type { Category, NavLinkWithCategory } from "@/lib/types";
import { useState, useEffect } from "react";

interface Props {
  categories: Category[];
  editingLink: NavLinkWithCategory | null;
  onSave: () => void;
  onCancel: () => void;
}

export function LinkForm({ categories, editingLink, onSave, onCancel }: Props) {
  const [form, setForm] = useState({
    title: "",
    url: "",
    description: "",
    icon: "",
    category_id: null as string | null,
    approved: true,
    featured: false,
  });

  // 切换编辑目标时填充表单
  useEffect(() => {
    if (editingLink) {
      // 表单同步模式：editingLink 变化时同步表单状态
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({
        title: editingLink.title,
        url: editingLink.url,
        description: editingLink.description || "",
        icon: editingLink.icon || "",
        category_id: editingLink.category_id ?? null,
        approved: editingLink.approved,
        featured: editingLink.featured,
      });
    }
  }, [editingLink]);

  function resetForm() {
    setForm({
      title: "",
      url: "",
      description: "",
      icon: "",
      category_id: categories[0]?.id ?? null,
      approved: true,
      featured: false,
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = editingLink ? `/api/admin/links/${editingLink.id}` : "/api/admin/links";
    const method = editingLink ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      resetForm();
      onCancel();
      onSave();
    } else {
      const d = await res.json();
      alert(d.error || "操作失败");
    }
  }

  const isEditing = !!editingLink;

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
      <h3 className="font-medium text-white">{isEditing ? "编辑链接" : "新增链接"}</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="标题 *" required>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="field-input" required />
        </Field>
        <Field label="URL *" required>
          <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
            className="field-input" required />
        </Field>
        <Field label="描述">
          <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            className="field-input" />
        </Field>
        <Field label="图标">
          <input value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
            className="field-input" />
        </Field>
        <Field label="分类">
          <select value={form.category_id ?? ""} onChange={e => setForm(f => ({ ...f, category_id: e.target.value || null }))}
            className="field-input">
            <option value="">无分类</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
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
        <button type="submit" aria-label={isEditing ? "保存编辑" : "添加新链接"}
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400">
          {isEditing ? "保存" : "添加"}
        </button>
        <button type="button" aria-label="取消编辑" onClick={onCancel}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white/60 transition hover:bg-white/20">
          取消
        </button>
        {isEditing && (
          <button type="button" aria-label="切换为新增链接" onClick={resetForm}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white/60 transition hover:bg-white/20">
            新增新链接
          </button>
        )}
      </div>
    </form>
  );
}

function Field({ label, children, required }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-white/50">{label}{required && " *"}</label>
      {children}
    </div>
  );
}
