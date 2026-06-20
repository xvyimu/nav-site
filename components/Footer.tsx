import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border/40 bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <p>
            © 2026{" "}
            <Link href="https://yuanjia1314.ccwu.cc" className="hover:text-foreground transition-colors">
              公益API导航站
            </Link>
            {" · "}收录公益AI中转站，助你实现Token自由
          </p>
          <div className="flex items-center gap-3 text-xs">
            <Link href="https://halo.oneln.org/" target="_blank" className="hover:text-foreground transition-colors">
              ✦ oneLN
            </Link>
            <span className="text-border">|</span>
            <span className="inline-flex items-center gap-1">
              <span className="text-amber-400">★</span> 本站满天星
              <span className="text-amber-400">★</span>
            </span>
            <span className="text-border">|</span>
            <Link href="/submit" className="hover:text-foreground transition-colors">
              提交站点
            </Link>
          </div>
        </div>
      </div>
      {/* 页脚小标 - 来自用户素材 */}
      <div className="mx-auto max-w-6xl px-4 pb-2 text-center text-[10px] text-muted-foreground/50">
        <a href="https://halo.oneln.org/" target="_blank" title="同款网站搭建" className="hover:text-muted-foreground transition-colors">
          oneLN
        </a>
      </div>
    </footer>
  );
}
