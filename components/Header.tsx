import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-medium tracking-tight">
          <span className="text-base">⬡</span>
          <span>公益API导航</span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link
            href="/submit"
            className="inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-medium text-muted-foreground/70 transition-colors hover:bg-white/[0.06] hover:text-foreground"
          >
            提交
          </Link>
          <Link
            href="/admin"
            className="inline-flex h-8 items-center justify-center rounded-md bg-foreground/[0.07] px-3 text-sm font-medium text-foreground transition-colors hover:bg-foreground/[0.12]"
          >
            管理
          </Link>
        </nav>
      </div>
    </header>
  );
}
