import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col items-center gap-1.5 text-xs text-muted-foreground/50">
          <p>© 2026 公益API导航站</p>
          <div className="flex items-center gap-3">
            <Link href="/submit" className="hover:text-foreground/60 transition-colors">
              提交站点
            </Link>
            <span>·</span>
            <Link href="/admin" className="hover:text-foreground/60 transition-colors">
              管理
            </Link>
            <span>·</span>
            <a
              href="https://halo.oneln.org/"
              target="_blank"
              rel="noopener noreferrer"
              title="同款网站搭建"
              className="text-primary/40 hover:text-primary/70 transition-colors"
            >
              oneLN
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}