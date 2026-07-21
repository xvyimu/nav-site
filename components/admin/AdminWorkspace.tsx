"use client";

import dynamic from "next/dynamic";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Files,
  FolderTree,
  Link2,
  ListChecks,
  Loader2,
  Plus,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "@/lib/admin/client";
import type { AdminLinksPage } from "@/lib/admin/contracts";
import type { Category, NavLink } from "@/lib/types";
import {
  adminQueryKeys,
  useAdminCategories,
} from "@/components/admin/admin-queries";
import { FadeContent } from "@/components/admin/FadeContent";
import { LinkList } from "@/components/admin/LinkList";
import { useAdminLinks } from "@/components/admin/useAdminLinks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/** 延迟加载编辑表单，降低管理首页初始客户端代码。 */
const LinkForm = dynamic(
  () => import("@/components/admin/LinkForm").then((module) => module.LinkForm),
  {
    loading: () => (
      <div className="space-y-4 p-6" aria-label="正在加载表单">
        <div className="h-10 animate-pulse rounded-md bg-[var(--admin-surface)]" />
        <div className="h-10 animate-pulse rounded-md bg-[var(--admin-surface)]" />
        <div className="h-24 animate-pulse rounded-md bg-[var(--admin-surface)]" />
      </div>
    ),
  }
);

const PAGE_SIZE = 20;
type StatusFilter = "all" | "pending" | "featured";

interface AdminWorkspaceProps {
  initialPage: AdminLinksPage;
  initialCategories: Category[];
}

/** 管理链接工作台，负责筛选、分页和编辑交互，不感知 HTTP 细节。 */
export function AdminWorkspace({ initialPage, initialCategories }: AdminWorkspaceProps) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [editingLink, setEditingLink] = useState<NavLink | null | undefined>(undefined);
  const [deletingLink, setDeletingLink] = useState<NavLink | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deferredQuery = useDeferredValue(query.trim());

  const filters = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      query: deferredQuery,
      category,
      status,
    }),
    [category, deferredQuery, page, status]
  );

  const linksQuery = useAdminLinks(initialPage, filters);

  const categoriesQuery = useAdminCategories(initialCategories);

  const linksPage: AdminLinksPage = linksQuery.data ?? {
    links: [],
    total: 0,
    page,
    pageSize: PAGE_SIZE,
  };
  const categories: Category[] = categoriesQuery.data ?? initialCategories;
  const pageCount = Math.max(1, Math.ceil(linksPage.total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);

  const stats = useMemo(
    () => ({
      total: linksPage.total,
      visible: linksPage.links.length,
      pages: pageCount,
      categories: categories.length,
    }),
    [categories.length, linksPage.links.length, linksPage.total, pageCount]
  );

  /** 任一筛选条件变化时回到第一页。 */
  const resetPage = useCallback(() => setPage(1), []);

  /**
   * 保存成功：先乐观写进当前筛选缓存，再后台失效对齐服务端；
   * 避免整表闪烁与等待网络 refetch。
   */
  const handleSaved = useCallback((savedLink: NavLink) => {
    queryClient.setQueriesData<AdminLinksPage>(
      { queryKey: adminQueryKeys.links },
      (current) => {
        if (!current) return current;
        const idx = current.links.findIndex((item) => item.id === savedLink.id);
        if (idx >= 0) {
          const nextLinks = current.links.slice();
          nextLinks[idx] = { ...nextLinks[idx], ...savedLink };
          return { ...current, links: nextLinks };
        }
        // 新建：插到当前页顶部并增加 total
        return {
          ...current,
          total: current.total + 1,
          links: [savedLink, ...current.links].slice(0, current.pageSize),
        };
      }
    );
    void queryClient.invalidateQueries({
      queryKey: adminQueryKeys.links,
      refetchType: "active",
    });
    setEditingLink(undefined);
    toast.success("链接已保存");
  }, [queryClient]);

  /** 删除：乐观移出列表，失败则回滚；末页变空时回退一页。 */
  const handleDelete = useCallback(async () => {
    if (!deletingLink || deleting) return;
    setDeleting(true);

    const previous = queryClient.getQueriesData<AdminLinksPage>({
      queryKey: adminQueryKeys.links,
    });

    queryClient.setQueriesData<AdminLinksPage>(
      { queryKey: adminQueryKeys.links },
      (current) => {
        if (!current) return current;
        const nextLinks = current.links.filter((item) => item.id !== deletingLink.id);
        if (nextLinks.length === current.links.length) return current;
        return {
          ...current,
          links: nextLinks,
          total: Math.max(0, current.total - 1),
        };
      }
    );

    try {
      await adminApi.links.remove(deletingLink.id);
      if (linksPage.links.length === 1 && page > 1) setPage((current) => current - 1);
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.links,
        refetchType: "active",
      });
      setDeletingLink(null);
      toast.success("链接已删除");
    } catch (error) {
      for (const [key, data] of previous) {
        queryClient.setQueryData(key, data);
      }
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  }, [deleting, deletingLink, linksPage.links.length, page, queryClient]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">
            内容管理
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight leading-tight text-[var(--admin-text)]">
            链接工作台
          </h1>
        </div>
        <Button
          type="button"
          onClick={() => setEditingLink(null)}
          className="h-10 rounded-md bg-[var(--admin-primary)] px-4 text-white hover:bg-[var(--admin-primary-hover)]"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          新增链接
        </Button>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="链接概览">
        <Metric label="匹配记录" value={stats.total} icon={Link2} />
        <Metric label="当前页" value={stats.visible} icon={ListChecks} tone="success" />
        <Metric label="总页数" value={stats.pages} icon={Files} tone="warning" />
        <Metric label="分类" value={stats.categories} icon={FolderTree} />
      </section>

      <section className="admin-panel overflow-hidden" aria-labelledby="links-heading">
        <div className="border-b border-[var(--admin-border)] p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 id="links-heading" className="text-lg font-semibold">链接列表</h2>
              <div className="mt-0.5 flex items-center gap-2 text-sm text-[var(--admin-muted)]">
                <span>{linksPage.total} 条记录</span>
                {linksQuery.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="正在更新" />}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="relative block min-w-0 sm:w-64">
                <span className="sr-only">搜索链接</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--admin-faint)]"
                  strokeWidth={1.75}
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    resetPage();
                  }}
                  placeholder="搜索标题或网址"
                  className="field-input pl-9"
                />
              </label>

              <label>
                <span className="sr-only">按分类筛选</span>
                <select
                  value={category}
                  onChange={(event) => {
                    setCategory(event.target.value);
                    resetPage();
                  }}
                  className="field-input min-w-36"
                >
                  <option value="all">全部分类</option>
                  {categories.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-1" aria-label="审核状态筛选">
            {([
              ["all", "全部"],
              ["pending", "待审核"],
              ["featured", "精选"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={status === value}
                onClick={() => {
                  setStatus(value);
                  resetPage();
                }}
                className={
                  status === value
                    ? "min-h-9 rounded-md bg-[var(--admin-primary-soft)] px-3 text-sm font-medium text-[var(--admin-primary)]"
                    : "min-h-9 rounded-md px-3 text-sm font-medium text-[var(--admin-muted)] hover:bg-[var(--admin-surface)] hover:text-[var(--admin-text)]"
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {linksQuery.error ? (
          <div role="alert" className="m-4 rounded-md bg-[var(--admin-danger-soft)] px-4 py-3 text-sm text-[var(--admin-danger)]">
            {linksQuery.error instanceof Error ? linksQuery.error.message : "加载链接失败"}
          </div>
        ) : (
          <LinkList
            links={linksPage.links}
            onAdd={() => setEditingLink(null)}
            onEdit={setEditingLink}
            onDelete={setDeletingLink}
          />
        )}

        {linksPage.total > 0 && (
          <div className="flex items-center justify-between border-t border-[var(--admin-border)] px-4 py-3 text-sm sm:px-5">
            <span className="text-[var(--admin-muted)]">
              第 {currentPage} / {pageCount} 页
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-md"
                disabled={currentPage === 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                上一页
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-md"
                disabled={currentPage === pageCount}
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              >
                下一页
              </Button>
            </div>
          </div>
        )}
      </section>

      <Sheet
        open={editingLink !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditingLink(undefined);
        }}
      >
        <SheetContent className="w-full overflow-y-auto bg-white sm:max-w-xl">
          <SheetHeader className="border-b border-[var(--admin-border)] px-6 py-5 pr-16">
            <SheetTitle>{editingLink ? "编辑链接" : "新增链接"}</SheetTitle>
            <SheetDescription>
              {editingLink ? editingLink.title : "创建一条新的导航链接"}
            </SheetDescription>
          </SheetHeader>
          {editingLink !== undefined && (
            <FadeContent>
              <LinkForm
                key={editingLink?.id ?? "new"}
                categories={categories}
                editingLink={editingLink}
                onSave={handleSaved}
                onCancel={() => setEditingLink(undefined)}
              />
            </FadeContent>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={deletingLink !== null} onOpenChange={(open) => !open && setDeletingLink(null)}>
        <DialogContent className="rounded-lg border-[var(--admin-border)] bg-white shadow-[var(--admin-shadow)]">
          <DialogHeader>
            <DialogTitle>删除链接</DialogTitle>
            <DialogDescription>
              确定删除“{deletingLink?.title}”吗？此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-md" onClick={() => setDeletingLink(null)}>
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-md"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? "删除中" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** 渲染管理工作台的稳定尺寸指标项。 */
function Metric({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: typeof FolderTree;
  tone?: "default" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "bg-[var(--admin-success-soft)] text-[var(--admin-success)]"
      : tone === "warning"
        ? "bg-[var(--admin-warning-soft)] text-[var(--admin-warning)]"
        : "bg-[var(--admin-primary-soft)] text-[var(--admin-primary)]";

  return (
    <article className="admin-panel flex min-h-24 items-center gap-3 p-4 sm:p-5">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${toneClass}`}>
        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-[var(--admin-muted)]">{label}</p>
        <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
      </div>
    </article>
  );
}
