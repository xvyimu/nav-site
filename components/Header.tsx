"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import { Compass, Menu, Plus, Settings, Heart, Code2, LogIn, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useShell } from "@/components/Shell";
import { useFavoritesContext } from "@/components/FavoritesProvider";

export function Header() {
  const { toggleSidebar } = useShell();
  const { count } = useFavoritesContext();
  const { data: session, status } = useSession();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const isAuthenticated = mounted && status === "authenticated";
  const isAdmin = isAuthenticated && (session?.user as { role?: string } | undefined)?.role === "admin";

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background">
      <div className="mx-auto flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          {/* Hamburger button (mobile only) */}
          <button
            onClick={toggleSidebar}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/50 hover:bg-muted hover:text-foreground transition-colors md:hidden"
            aria-label="打开导航菜单"
          >
            <Menu className="h-[18px] w-[18px]" />
          </button>
          <Link href="/" className="flex items-center gap-2 font-medium text-foreground/80">
            <Compass className="h-5 w-5 text-primary" />
            <span className="text-sm">综合导航站</span>
          </Link>
        </div>
        <nav className="flex items-center gap-1" aria-label="主导航">
          <Link
            href="/favorites"
            className="relative inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors"
          >
            <Heart className="h-3.5 w-3.5" />
            收藏
            {count > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-1.5 py-[1px] text-[10px] font-medium text-primary min-w-[16px] h-4">
                {count}
              </span>
            )}
          </Link>
          <Link
            href="/api-docs"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors"
          >
            <Code2 className="h-3.5 w-3.5" />
            API
          </Link>
          <Link
            href="/submit"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            提交
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors"
            >
              <Settings className="h-3.5 w-3.5" />
              管理
            </Link>
          )}
          {/* Auth button */}
          {mounted && !isAuthenticated && (
            <button
              onClick={() => signIn("github", { callbackUrl: "/" })}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors"
              aria-label="使用 GitHub 登录"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">登录</span>
            </button>
          )}
          {mounted && isAuthenticated && (
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors"
              aria-label="退出登录"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">退出</span>
            </button>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
