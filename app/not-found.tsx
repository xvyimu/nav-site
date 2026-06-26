import Link from "next/link";
import { Compass, Search, Home, Plus } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
      <div className="flex flex-col items-center gap-6 text-center max-w-md">
        {/* 大号 404 */}
        <div className="relative">
          <span className="text-[120px] font-bold leading-none text-primary/10 select-none">
            404
          </span>
          <Compass className="absolute inset-0 m-auto h-12 w-12 text-primary/40 animate-pulse" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-foreground/80">
            页面未找到
          </h1>
          <p className="text-sm text-muted-foreground/60 leading-relaxed">
            你访问的页面可能已被移除、重命名，或从未存在。
            <br />
            试试搜索你需要的工具，或者返回首页浏览。
          </p>
        </div>

        {/* 操作按钮 */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Home className="h-3.5 w-3.5" />
            返回首页
          </Link>
          <Link
            href="/#search"
            className="inline-flex items-center gap-1.5 rounded-full border border-input bg-background/80 px-5 py-2 text-sm text-foreground/70 transition-all hover:border-primary/60 hover:text-primary"
          >
            <Search className="h-3.5 w-3.5" />
            搜索工具
          </Link>
          <Link
            href="/submit"
            className="inline-flex items-center gap-1.5 rounded-full border border-input bg-background/80 px-5 py-2 text-sm text-foreground/70 transition-all hover:border-primary/60 hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            提交站点
          </Link>
        </div>
      </div>
    </div>
  );
}
