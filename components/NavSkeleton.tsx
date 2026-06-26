/** 骨架屏占位数量（与实际数据结构近似） */
const SIDEBAR_ITEMS = 6;
const CONTENT_SECTIONS = 3;
const CARDS_PER_SECTION = 5;

export function NavSkeleton() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* Sidebar skeleton */}
      <aside className="w-64 shrink-0 border-r border-border/50 hidden md:block p-3 space-y-1">
        {Array.from({ length: SIDEBAR_ITEMS }).map((_, i) => (
          <div key={i} className="h-9 rounded-lg bg-muted/40 animate-pulse" />
        ))}
      </aside>

      {/* Content skeleton */}
      <div className="flex-1 min-w-0 px-4 py-6 md:px-6 w-full space-y-6">
        {/* Search bar skeleton */}
        <div className="h-11 rounded-[24px] bg-muted/40 animate-pulse" />

        {/* Section skeletons */}
        {Array.from({ length: CONTENT_SECTIONS }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="h-4 w-24 bg-muted/40 animate-pulse rounded" />
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {Array.from({ length: CARDS_PER_SECTION }).map((_, j) => (
                <div
                  key={j}
                  className="h-[66px] rounded-xl bg-muted/40 animate-pulse"
                  style={{ animationDelay: `${(i * CARDS_PER_SECTION + j) * 40}ms` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
