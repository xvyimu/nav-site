import type { ResourceItem } from "@/lib/types";
import { logger } from "@/lib/logger";
import {
  RESOURCE_LIBRARY_SAFE_PAGE_COLUMNS,
  createResourceLibraryReadClient,
} from "./client";

const BROWSE_TIMEOUT_MS = 5000;

export type ResourceBrowseResult =
  | { ok: true; results: ResourceItem[] }
  | { ok: false; reason: "not_configured" | "query_failed" };

export async function browseResources({
  category,
  limit = 80,
}: {
  category?: string;
  limit?: number;
} = {}): Promise<ResourceBrowseResult> {
  const read = createResourceLibraryReadClient();
  if (!read) return { ok: false, reason: "not_configured" };

  try {
    let query = read.client
      .from(read.pagesSource)
      .select(RESOURCE_LIBRARY_SAFE_PAGE_COLUMNS)
      .order("crawled_at", { ascending: false })
      .limit(limit);
    if (category) query = query.eq("category", category);

    const { data, error } = await query.abortSignal(
      AbortSignal.timeout(BROWSE_TIMEOUT_MS)
    );
    if (error) {
      logger.warn("Resource browse query failed", {
        source: "resource-browse",
        code: error.code,
      });
      return { ok: false, reason: "query_failed" };
    }

    const results: ResourceItem[] = (data ?? []).map((row: {
      id: string;
      title: string;
      url: string;
      domain: string;
      summary?: string | null;
      category?: string | null;
      tags?: string[] | null;
      crawled_at?: string | null;
    }) => ({
      id: row.id,
      title: row.title.replace(/\r/g, "").trim(),
      url: row.url,
      domain: row.domain,
      summary: row.summary ?? "",
      category: row.category ?? "Other",
      tags: row.tags ?? [],
      crawled_at: row.crawled_at ?? "",
      rank: 0,
    }));
    return { ok: true, results };
  } catch (e) {
    logger.warn("Resource browse request failed", {
      source: "resource-browse",
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, reason: "query_failed" };
  }
}
