import { Suspense } from "react";
import { type NavLink } from "@/lib/types";
import { Navigation } from "@/components/Navigation";
import { NavSkeleton } from "@/components/NavSkeleton";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { getModelRankings } from "@/lib/model-rankings";
import { getCategories, getApprovedLinks } from "@/lib/repositories";

// ISR: 每 60 秒重新生成页面
export const revalidate = 60;

export default async function Home() {
  const [categories, links, rankings] = await Promise.all([
    getCategories(),
    getApprovedLinks(),
    getModelRankings(),
  ]);

  return (
    <div className="w-full">
      <ErrorBoundary>
        <Suspense fallback={<NavSkeleton />}>
          <Navigation
            categories={categories}
            links={links as NavLink[]}
            modelRankings={rankings}
          />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
