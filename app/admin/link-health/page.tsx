import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LinkHealthPanel } from "@/components/admin/LinkHealthPanel";

/** 管理后台 · 链接健康待处理队列（C3）。 */
export default async function AdminLinkHealthPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  return <LinkHealthPanel />;
}
