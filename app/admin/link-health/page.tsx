import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** 延迟加载链接健康面板，与分类页同一动态 import 边界。 */
const LinkHealthPanel = dynamic(
  () =>
    import("@/components/admin/LinkHealthPanel").then(
      (module) => module.LinkHealthPanel
    ),
  {
    loading: () => (
      <div className="space-y-6" aria-label="正在加载链接健康">
        <div className="h-10 w-40 animate-pulse rounded-md bg-[var(--admin-surface)]" />
        <div className="admin-panel min-h-72 animate-pulse bg-[var(--admin-surface)]" />
      </div>
    ),
  }
);

/** 管理后台 · 链接健康待处理队列（C3）。 */
export default async function AdminLinkHealthPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  return <LinkHealthPanel />;
}
