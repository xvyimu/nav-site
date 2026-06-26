import { Suspense } from "react";
import { type NavLink } from "@/lib/types";
import { Navigation } from "@/components/Navigation";
import { NavSkeleton } from "@/components/NavSkeleton";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { getModelRankings } from "@/lib/model-rankings";
import { getCategories, getApprovedLinks } from "@/lib/repositories";
import { withTimeout } from "@/lib/utils";
import { logger } from "@/lib/logger";

// ISR: 每 60 秒重新生成页面
export const revalidate = 60;

// 数据获取超时（秒）：Supabase 不可达时降级返回空数据而非挂起
const FETCH_TIMEOUT = 8000;

export default async function Home() {
  const [categories, links, rankings] = await Promise.all([
    withTimeout(getCategories(), FETCH_TIMEOUT).catch(() => {
      logger.warn("getCategories timed out, using empty fallback");
      return [];
    }),
    withTimeout(getApprovedLinks(), FETCH_TIMEOUT).catch(() => {
      logger.warn("getApprovedLinks timed out, using empty fallback");
      return [];
    }),
    withTimeout(getModelRankings(), FETCH_TIMEOUT).catch(() => {
      logger.warn("getModelRankings timed out, using empty fallback");
      return [];
    }),
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
