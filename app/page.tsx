import { Suspense } from "react";
import { connection } from "next/server";
import { type NavLink, type Category } from "@/lib/types";
import { Navigation } from "@/components/Navigation";
import { NavSkeleton } from "@/components/NavSkeleton";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { getModelRankings } from "@/lib/model-rankings";
import { getCategories, getApprovedLinks } from "@/lib/repositories";
import { withTimeout, escapeJsonForHtml } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { SECTION_LABELS } from "@/lib/nav-config";
import {
  buildDescendantSlugsMap,
  buildTabKeys,
  buildTabCounts,
  buildTabTree,
  buildAvailableTags,
  type PrecomputedNavData,
} from "@/lib/nav-derived-data";

// ISR: 每 60 秒重新生成页面
export const revalidate = 60;

// 数据获取超时（秒）：Supabase 不可达时降级返回空数据而非挂起
const FETCH_TIMEOUT = 15000;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yuanjia1314.ccwu.cc";
const siteName = "综合导航站";

/**
 * 根据分类 slug 生成 CollectionPage JSON-LD。
 *
 * 当 URL 含 ?cat=xxx 时，告诉搜索引擎「这个页面是关于 xxx 分类的集合页」，
 * 配合 layout.tsx 里的 WebSite + SearchAction schema 一起工作。
 * 无 cat 参数时返回 null（首页由 layout 的 WebSite schema 覆盖）。
 */
function buildCollectionPageJsonLd(catSlug: string, categories: Category[]) {
  const cat = categories.find((c) => c.slug === catSlug);
  if (!cat) return null;
  const label = SECTION_LABELS[cat.slug] || cat.name;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${label} — ${siteName}`,
    url: `${siteUrl}/?cat=${encodeURIComponent(cat.slug)}`,
    description: cat.description ?? `${label}分类下的精选工具与站点收录`,
    isPartOf: {
      "@type": "WebSite",
      name: siteName,
      url: siteUrl,
    },
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  await connection();

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

  const { cat } = await searchParams;

  // 服务端预计算派生数据（useLinksFilter 中 5 个纯 useMemo 的服务端版本）
  const descendantSlugsMap = buildDescendantSlugsMap(categories);
  const tabKeys = buildTabKeys(categories);
  const precomputed: PrecomputedNavData = {
    descendantSlugsMap,
    tabKeys,
    tabCounts: buildTabCounts(tabKeys, links as NavLink[], descendantSlugsMap),
    tabTree: buildTabTree(categories, links as NavLink[], descendantSlugsMap),
    availableTags: buildAvailableTags(links as NavLink[]),
  };

  const collectionJsonLd = cat ? buildCollectionPageJsonLd(cat, categories) : null;

  return (
    <div className="w-full">
      {collectionJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: escapeJsonForHtml(JSON.stringify(collectionJsonLd)) }}
        />
      )}
      <ErrorBoundary>
        <Suspense fallback={<NavSkeleton />}>
          <Navigation
            categories={categories}
            links={links as NavLink[]}
            modelRankings={rankings}
            precomputed={precomputed}
          />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
