export function NavSkeleton() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* Sidebar skeleton */}
      <aside className="w-56 shrink-0 border-r border-border/50 hidden md:block p-3 space-y-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-9 rounded-lg bg-muted/40 animate-pulse" />
        ))}
      </aside>

      {/* Content skeleton */}
      <div className="flex-1 min-w-0 px-4 py-6 md:px-6 max-w-6xl mx-auto w-full space-y-6">
        {/* Search bar skeleton */}
        <div className="h-11 rounded-full bg-muted/40 animate-pulse" />

        {/* Section skeletons */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="h-4 w-24 bg-muted/40 animate-pulse rounded" />
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {Array.from({ length: 5 }).map((_, j) => (
                <div
                  key={j}
                  className="h-28 rounded-xl bg-muted/40 animate-pulse"
                  style={{ animationDelay: `${(i * 5 + j) * 40}ms` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
