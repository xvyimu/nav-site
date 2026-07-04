import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#07100f] pt-20 text-white">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col items-center gap-1.5 text-xs text-white/45">
          <p>© 2026 综合导航站</p>
          <div className="flex items-center gap-3">
            <Link href="/submit" className="transition-colors hover:text-white/70">
              提交站点
            </Link>
            <span>·</span>
            <Link href="/admin" className="transition-colors hover:text-white/70">
              管理
            </Link>
            <span>·</span>
            <a
              href="https://halo.oneln.org/"
              target="_blank"
              rel="noopener noreferrer"
              title="同款网站搭建"
              className="text-emerald-100/50 transition-colors hover:text-emerald-100/80"
            >
              oneLN
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
