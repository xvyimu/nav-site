import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-white/10">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground/50">
          <p>
            © 2026{" "}
            <Link href="/" className="text-foreground/70 hover:text-foreground transition-colors">
              公益API导航站
            </Link>
            {" · "}收录公益AI中转站，助你实现Token自由
          </p>
          <div className="flex items-center gap-3">
            <Link href="/submit" className="hover:text-foreground/80 transition-colors">
              提交站点
            </Link>
            <span className="text-border">·</span>
            <Link href="/admin" className="hover:text-foreground/80 transition-colors">
              管理
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
