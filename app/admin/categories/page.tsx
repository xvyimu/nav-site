import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAllCategoriesForAdmin } from "@/lib/repositories";

/** 延迟加载分类工作台，避免 admin 共享边界同步拉入重客户端块。 */
const CategoryManager = dynamic(
  () =>
    import("@/components/admin/CategoryManager").then(
      (module) => module.CategoryManager
    ),
  {
    loading: () => (
      <div className="space-y-6" aria-label="正在加载分类管理">
        <div className="h-10 w-48 animate-pulse rounded-md bg-[var(--admin-surface)]" />
        <div className="admin-panel min-h-72 animate-pulse bg-[var(--admin-surface)]" />
      </div>
    ),
  }
);

/** 管理后台分类页：服务端预取全部分类后交给 CategoryManager。 */
export default async function AdminCategoriesPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const categories = await getAllCategoriesForAdmin();
  return <CategoryManager initialCategories={categories} />;
}
