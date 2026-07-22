import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import NotFound from "@/app/not-found";
import { getApprovedLinkBySlug, getRelatedLinks, getCategories } from "@/lib/repositories";
import { slugify } from "@/lib/slugify";
import { relativeTime } from "@/lib/types";
import { escapeJsonForHtml, isSafeUrl, withTimeout } from "@/lib/utils";
import { getCspNonce } from "@/lib/csp-server";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ReviewSection } from "@/components/ReviewSection";
import { logger } from "@/lib/logger";
import { createStaticClient } from "@/lib/supabase/server";

export const revalidate = 60;

const FETCH_TIMEOUT = 8000;

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * 预生成所有工具详情页的静态参数
 * 返回空数组 — 页面通过 ISR 按需生成，公开数据使用无 cookie 的静态客户端。
 */
export async function generateStaticParams() {
  return [];
}

/**
 * 动态生成 SEO 元数据
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const link = await withTimeout(getApprovedLinkBySlug(slug), FETCH_TIMEOUT).catch(() => null);
  if (!link) {
    return { title: "工具未找到" };
  }

  const title = `${link.title} - AI 工具详情 | AI 导航站`;
  const description = link.description
    ? `${link.title}：${link.description.slice(0, 150)}`
    : `${link.title} 是一个 AI 工具，收录在 AI 导航站。点击访问官网了解详情。`;

  return {
    title,
    description,
    alternates: {
      canonical: `/tool/${slug}`,
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: `/tool/${slug}`,
      images: link.icon ? [{ url: link.icon }] : undefined,
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

/**
 * 生成 JSON-LD 结构化数据（SoftwareApplication schema）
 */
function generateJsonLd(link: Awaited<ReturnType<typeof getApprovedLinkBySlug>>) {
  if (!link) return null;

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: link.title,
    applicationCategory: "AI工具",
    operatingSystem: "Web",
    description: link.description || `${link.title} - AI 工具`,
    url: link.url,
    ...(link.icon && { image: link.icon }),
    ...(link.category_name && {
      applicationSubCategory: link.category_name,
    }),
    offers: {
      "@type": "Offer",
      price: link.paid ? "付费" : "0",
      priceCurrency: "CNY",
    },
    aggregateInteractionStatistic: {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/ViewAction",
      userInteractionCount: link.click_count,
    },
  };
}

export default async function ToolDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const link = await withTimeout(getApprovedLinkBySlug(slug), FETCH_TIMEOUT).catch(() => {
    logger.warn(`Tool detail: getApprovedLinkBySlug timed out for slug="${slug}"`);
    return null;
  });

  if (!link) {
    return <NotFound />;
  }
  const data = link; // 类型收窄：notFound() 之后 TS 仍不认识 link 已非 null
  const staticClient = createStaticClient();

  const [relatedLinks, categories] = await Promise.all([
    withTimeout(getRelatedLinks(data.category_id, data.url), FETCH_TIMEOUT).catch(() => {
      logger.warn("Tool detail: getRelatedLinks timed out");
      return [];
    }),
    withTimeout(getCategories(staticClient), FETCH_TIMEOUT).catch(() => []),
  ]);

  const jsonLd = generateJsonLd(data);
  const categoryName = data.category_name || "未分类";
  // Only hits headers() when CSP_DYNAMIC=1 (see getCspNonce).
  const nonce = await getCspNonce();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* JSON-LD 结构化数据 */}
      {jsonLd && (
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: escapeJsonForHtml(JSON.stringify(jsonLd)) }}
        />
      )}

      {/* 面包屑导航 */}
      <nav className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground/70" aria-label="面包屑导航">
        <Link href="/" className="hover:text-foreground transition-colors">首页</Link>
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {data.category_slug && (
          <>
            <Link href={`/?cat=${data.category_slug}`} className="hover:text-foreground transition-colors">
              {categoryName}
            </Link>
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </>
        )}
        <span className="text-foreground/60 font-medium">{data.title}</span>
      </nav>

      {/* 工具信息卡片 */}
      <div className="mb-8 rounded-xl border border-border bg-card/50 p-6">
        <div className="flex items-start gap-4">
          {data.icon && isSafeUrl(data.icon) && (
            <Image
              src={data.icon}
              alt={data.title}
              width={64}
              height={64}
              className="h-16 w-16 rounded-xl border border-border object-cover"
              loading="eager"
              unoptimized
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{data.title}</h1>
              {data.featured && (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                  精选
                </span>
              )}
              {data.paid && (
                <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                  付费
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{categoryName}</p>
          </div>
        </div>

        {/* 答案胶囊（GEO 优化 — 便于 AI 引擎直接引用） */}
        <p className="mt-4 text-base leading-relaxed">
          <strong>{data.title}</strong>
          {data.description ? ` — ${data.description}` : " 是一个收录在 AI 导航站的 AI 工具。"}
          {" 点击下方链接即可访问官网。"}
        </p>

        {/* 访问按钮 */}
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          访问官网
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7-7 7M21 12H3" />
          </svg>
        </a>

        {/* 元数据 */}
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>点击量：{data.click_count}</span>
          <span>收录时间：{relativeTime(data.created_at)}</span>
          {data.updated_at && <span>更新时间：{relativeTime(data.updated_at)}</span>}
        </div>
      </div>

      {/* 相关工具推荐 */}
      {relatedLinks.length > 0 && (
        <ErrorBoundary>
          <section className="mb-8">
            <h2 className="mb-4 text-lg font-semibold">相关工具</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {relatedLinks.map((tool) => (
                <Link
                  key={tool.id}
                  href={`/tool/${tool.slug || slugify(tool.title)}`}
                  className="group rounded-lg border border-border p-4 transition-colors hover:border-primary/50 hover:bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    {tool.icon && isSafeUrl(tool.icon) && (
                      <Image
                        src={tool.icon}
                        alt={tool.title}
                        width={32}
                        height={32}
                        className="h-8 w-8 rounded-md object-cover"
                        loading="lazy"
                        unoptimized
                      />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium group-hover:text-primary transition-colors">
                        {tool.title}
                      </p>
                      {tool.description && (
                        <p className="truncate text-xs text-muted-foreground">
                          {tool.description}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </ErrorBoundary>
      )}

      {/* 用户评价 */}
      <Suspense fallback={null}>
        <ErrorBoundary>
          <ReviewSection linkId={data.id} />
        </ErrorBoundary>
      </Suspense>

      {/* 分类导航 */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">浏览分类</h2>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/?cat=${cat.slug}`}
              className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {cat.icon && <span className="mr-1">{cat.icon}</span>}
              {cat.name}
            </Link>
          ))}
        </div>
      </section>

      {/* 返回首页 */}
      <div className="mt-8 text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7 7-7M3 12h18" />
          </svg>
          返回首页
        </Link>
      </div>
    </div>
  );
}
