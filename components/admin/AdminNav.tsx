"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderTree, LayoutDashboard, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin", label: "链接管理", icon: LayoutDashboard },
  { href: "/admin/categories", label: "分类管理", icon: FolderTree },
  { href: "/admin/link-health", label: "链接健康", icon: Link2 },
] as const;

/** 管理后台主导航；compact 用于移动顶栏横向滚动。 */
export function AdminNav({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="管理后台导航"
      className={cn(
        compact ? "flex items-center gap-1 overflow-x-auto" : "space-y-1"
      )}
    >
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = href === "/admin" ? pathname === href : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
              active
                ? "bg-[var(--admin-primary-soft)] text-[var(--admin-primary)]"
                : "text-[var(--admin-muted)] hover:bg-[var(--admin-surface)] hover:text-[var(--admin-text)]",
              compact && "shrink-0"
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
