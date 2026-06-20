import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg tracking-tight">
          <span className="text-xl">🌐</span>
          <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
            公益API导航
          </span>
        </Link>
        <nav className="flex items-center gap-3">
          <Link
            href="/submit"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            提交站点
          </Link>
        </nav>
      </div>
    </header>
  );
}