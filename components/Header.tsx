"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { Code2, Compass, Heart, LogIn, LogOut, Menu, Plus, Settings } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useFavoritesContext } from "@/components/FavoritesProvider";
import { useShell } from "@/components/Shell";
import { useLogout } from "@/hooks/useLogout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function Header() {
  const { toggleSidebar, sidebarOpen } = useShell();
  const { count } = useFavoritesContext();
  const { data: session, status } = useSession();
  const { logout, loading: loggingOut } = useLogout();
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const isAuthenticated = mounted && status === "authenticated";
  const isAdmin = isAuthenticated && (session?.user as { role?: string } | undefined)?.role === "admin";

  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-[var(--paper-bg)]/82 px-3 pt-3 backdrop-blur-sm md:px-6">
      <div className="mx-auto grid h-12 max-w-[1480px] grid-cols-[1fr_auto_1fr] items-center rounded-2xl border border-[var(--paper-line)] bg-[var(--paper-surface)]/82 px-3 text-[var(--paper-ink)] shadow-[0_8px_28px_rgba(61,74,90,0.06)] backdrop-blur-md md:h-14 md:px-5">
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="md:hidden"
            aria-label="打开导航菜单"
            aria-expanded={sidebarOpen}
            aria-controls="mobile-nav-sheet"
          >
            <Menu className="h-[18px] w-[18px]" />
          </Button>
          <DesktopNavLink href="/favorites" icon={<Heart className="h-3.5 w-3.5" />} label="收藏" badge={count} />
          <DesktopNavLink href="/api-docs" icon={<Code2 className="h-3.5 w-3.5" />} label="API" />
          <DesktopNavLink href="/submit" icon={<Plus className="h-3.5 w-3.5" />} label="提交" />
        </div>

        <Link href="/" className="group flex items-center gap-2 text-center" aria-label="返回首页">
          <Compass className="h-5 w-5 text-[var(--paper-accent)] transition group-hover:rotate-12" />
          <span className="nav-display hidden text-lg leading-none tracking-normal text-[var(--paper-ink)] sm:inline">
            导航图谱
          </span>
        </Link>

        <nav className="flex items-center justify-end gap-1" aria-label="主导航">
          {isAdmin && (
            <DesktopNavLink href="/admin" icon={<Settings className="h-3.5 w-3.5" />} label="管理" />
          )}

          {mounted && !isAuthenticated && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => signIn("github", { callbackUrl: "/" })}
              className="hidden font-mono uppercase sm:inline-flex"
              aria-label="使用 GitHub 登录"
            >
              <LogIn className="h-3.5 w-3.5" />
              登录
            </Button>
          )}
          {mounted && isAuthenticated && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={logout}
              disabled={loggingOut}
              className="hidden font-mono uppercase sm:inline-flex"
              aria-label="退出登录"
            >
              <LogOut className="h-3.5 w-3.5" />
              {loggingOut ? "退出中..." : "退出"}
            </Button>
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
    <Button
      asChild
      variant="ghost"
      size="sm"
      className="hidden font-mono uppercase md:inline-flex"
    >
      <Link href={href}>
        {icon}
        {label}
        {!!badge && badge > 0 && (
          <Badge variant="accent" className="h-4 min-w-4 px-1 text-[10px]">
            {badge}
          </Badge>
        )}
      </Link>
    </Button>
  );
}
