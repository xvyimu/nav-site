import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-medium text-foreground/80">
          <span className="text-lg text-primary">⬡</span>
          <span className="text-sm">公益API导航站</span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link href="/submit" className="inline-flex h-8 items-center rounded-md px-3 text-xs text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors">
            提交
          </Link>
          <Link href="/admin" className="inline-flex h-8 items-center rounded-md px-3 text-xs text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors">
            管理
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}