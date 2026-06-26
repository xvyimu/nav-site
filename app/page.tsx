import { Suspense } from "react";
import { type NavLink } from "@/lib/types";
import { Navigation } from "@/components/Navigation";
import { NavSkeleton } from "@/components/NavSkeleton";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { getModelRankings } from "@/lib/model-rankings";
import { getCategories, getApprovedLinks } from "@/lib/repositories";

// ISR: 每 60 秒重新生成页面
export const revalidate = 60;

async function NavContent() {
  const [categories, links, rankings] = await Promise.all([
    getCategories(),
    getApprovedLinks(),
    getModelRankings(),
  ]);

  return (
    <Navigation
      categories={categories}
      links={links as NavLink[]}
      modelRankings={rankings}
    />
  );
}

export default function Home() {
  return (
    <div className="w-full">
      <ErrorBoundary>
        <Suspense fallback={<NavSkeleton />}>
          <NavContent />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
