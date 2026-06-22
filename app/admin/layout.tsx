import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import LogoutButton from "@/components/admin/LogoutButton";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-950 via-slate-900 to-slate-950">
      <nav className="border-b border-white/10 bg-white/5 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/admin" className="text-lg font-bold text-white">
              ⚙ 管理面板
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <Link
                href="/admin"
                className="text-white/70 transition hover:text-white"
              >
                链接管理
              </Link>
              <Link
                href="/admin/categories"
                className="text-white/70 transition hover:text-white"
              >
                分类管理
              </Link>
              <Link href="/" className="text-white/40 transition hover:text-white/70">
                返回前台
              </Link>
            <LogoutButton />
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}