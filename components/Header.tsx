"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { Code2, Compass, Heart, LogIn, LogOut, Menu, Plus, Settings } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useFavoritesContext } from "@/components/FavoritesProvider";
import { useShell } from "@/components/Shell";
import { useLogout } from "@/hooks/useLogout";

export function Header() {
  const { toggleSidebar } = useShell();
  const { count } = useFavoritesContext();
  const { data: session, status } = useSession();
  const { logout, loading: loggingOut } = useLogout();
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const isAuthenticated = mounted && status === "authenticated";
  const isAdmin = isAuthenticated && (session?.user as { role?: string } | undefined)?.role === "admin";

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 md:px-6">
      <div className="mx-auto grid h-12 max-w-[1480px] grid-cols-[1fr_auto_1fr] items-center rounded-2xl border border-white/14 bg-[#07100f]/58 px-3 text-white shadow-[0_20px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl md:h-14 md:px-5">
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleSidebar}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white md:hidden"
            aria-label="打开导航菜单"
          >
            <Menu className="h-[18px] w-[18px]" />
          </button>
          <DesktopNavLink href="/favorites" icon={<Heart className="h-3.5 w-3.5" />} label="收藏" badge={count} />
          <DesktopNavLink href="/api-docs" icon={<Code2 className="h-3.5 w-3.5" />} label="API" />
          <DesktopNavLink href="/submit" icon={<Plus className="h-3.5 w-3.5" />} label="提交" />
        </div>

        <Link href="/" className="group flex items-center gap-2 text-center" aria-label="返回首页">
          <Compass className="h-5 w-5 text-emerald-100 transition group-hover:rotate-12" />
          <span className="hidden font-serif text-lg leading-none tracking-normal text-white sm:inline">
            导航图谱
          </span>
        </Link>

        <nav className="flex items-center justify-end gap-1" aria-label="主导航">
          {isAdmin && (
            <DesktopNavLink href="/admin" icon={<Settings className="h-3.5 w-3.5" />} label="管理" />
          )}

          {mounted && !isAuthenticated && (
            <button
              onClick={() => signIn("github", { callbackUrl: "/" })}
              className="hidden h-8 items-center gap-1.5 rounded-full px-3 text-xs font-mono uppercase text-white/70 transition hover:bg-white/10 hover:text-white sm:inline-flex"
              aria-label="使用 GitHub 登录"
            >
              <LogIn className="h-3.5 w-3.5" />
              登录
            </button>
          )}
          {mounted && isAuthenticated && (
            <button
              onClick={logout}
              disabled={loggingOut}
              className="hidden h-8 items-center gap-1.5 rounded-full px-3 text-xs font-mono uppercase text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-50 sm:inline-flex"
              aria-label="退出登录"
            >
              <LogOut className="h-3.5 w-3.5" />
              {loggingOut ? "退出中..." : "退出"}
            </button>
          )}
          <ThemeToggle variant="cinematic" />
        </nav>
      </div>
    </header>
  );
}

function DesktopNavLink({
  href,
  icon,
  label,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="hidden h-8 items-center gap-1.5 rounded-full px-3 text-xs font-mono uppercase text-white/68 transition hover:bg-white/10 hover:text-white md:inline-flex"
    >
      {icon}
      {label}
      {!!badge && badge > 0 && (
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-200/15 px-1 text-[10px] text-emerald-100">
          {badge}
        </span>
      )}
    </Link>
  );
}
