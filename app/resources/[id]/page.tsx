import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ResourceRating } from "../_components/ResourceRating";
import { isSafeUrl } from "@/lib/utils";
import {
  RESOURCE_LIBRARY_SAFE_PAGE_COLUMNS,
  createResourceLibraryReadClient,
} from "@/lib/resource-library/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DETAIL_TIMEOUT_MS = 5000;
const resourceIdSchema = z.string().uuid();

interface PageRow {
  id: string;
  title: string;
  url: string;
  domain: string;
  summary: string | null;
  category: string | null;
  tags: string[] | null;
  crawled_at: string | null;
}

export default async function ResourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!resourceIdSchema.safeParse(id).success) notFound();
  const read = createResourceLibraryReadClient();
  if (!read) notFound();

  let pageResult: { data: unknown };
  try {
    pageResult = await read.client
      .from(read.pagesSource)
      .select(RESOURCE_LIBRARY_SAFE_PAGE_COLUMNS)
      .eq("id", id)
      .abortSignal(AbortSignal.timeout(DETAIL_TIMEOUT_MS))
      .maybeSingle();
  } catch {
    pageResult = { data: null };
  }

  const { data } = pageResult;

  if (!data) notFound();
  const row = data as PageRow;

  const title = (row.title || "").replace(/\r/g, "").trim() || row.domain;
  const safeUrl = isSafeUrl(row.url) ? row.url : "#";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/resources"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        返回资源库
      </Link>

      <article className="mt-6">
        <header className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-sm text-muted-foreground">
              {row.domain?.slice(0, 2).toUpperCase() ?? "??"}
            </div>
            <div className="min-w-0">
              {row.category && (
                <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                  {row.category}
                </span>
              )}
            </div>
          </div>
          <h1 className="text-2xl font-bold leading-tight text-foreground">
            {title}
          </h1>
          <a
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary/80 hover:text-primary"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {row.domain}
          </a>
        </header>

        {row.summary && (
          <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-foreground/80">
            {row.summary}
          </p>
        )}

        {Array.isArray(row.tags) && row.tags.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {row.tags.map((t) => (
              <span
                key={t}
                className="rounded-md border border-border bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {row.crawled_at && (
          <p className="mt-6 text-xs text-muted-foreground/50">
            收录于 {new Date(row.crawled_at).toLocaleDateString("zh-CN")}
          </p>
        )}
      </article>

      <ResourceRating pageId={row.id} />
    </div>
  );
}
