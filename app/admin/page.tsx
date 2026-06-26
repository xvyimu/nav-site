"use client";

import { useState } from "react";
import type { NavLinkWithCategory } from "@/lib/types";
import { useAdminLinks } from "@/components/admin/useAdminLinks";
import { LinkForm } from "@/components/admin/LinkForm";
import { LinkList } from "@/components/admin/LinkList";

export default function AdminPage() {
  const { links, categories, loading, loadData, handleDelete } = useAdminLinks();
  const [editingLink, setEditingLink] = useState<NavLinkWithCategory | null | undefined>(undefined);

  function handleEdit(link: NavLinkWithCategory) {
    setEditingLink(link);
  }

  function handleAdd() {
    setEditingLink(null);
  }

  function handleSave() {
    setEditingLink(undefined);
    loadData();
  }

  function handleCancel() {
    setEditingLink(undefined);
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
          onClick={handleAdd}
          className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400"
          aria-label="新增链接"
        >
          + 新增链接
        </button>
      </div>

      {/* 新增/编辑表单：undefined = 隐藏，null = 新增，NavLinkWithCategory = 编辑 */}
      {editingLink !== undefined && (
        <LinkForm
          categories={categories}
          editingLink={editingLink}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}

      {/* 链接列表 */}
      <LinkList links={links} onEdit={handleEdit} onDelete={handleDelete} />
    </div>
  );
}