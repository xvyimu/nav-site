import { createServiceRoleClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { isMissingRelationError } from "@/lib/repositories/shared";

/** Open or historical link-health finding row. */
export interface LinkHealthFinding {
  id: string;
  link_id: string | null;
  title: string;
  url: string;
  http_status: string;
  detail: string | null;
  kind: "broken" | "redirect";
  checked_at: string;
  resolved_at: string | null;
  run_id: string | null;
}

/** Structured report produced by scripts/check-links.mjs --json. */
export interface LinkHealthReport {
  generatedAt: string;
  total: number;
  ok: number;
  broken: Array<{
    id?: string | null;
    title: string;
    url: string;
    status: string | number;
    error?: string;
  }>;
  redirects: Array<{
    id?: string | null;
    title: string;
    url: string;
    status: string | number;
    location?: string;
  }>;
}

export type ListOpenFindingsResult =
  | { findings: LinkHealthFinding[]; unavailable?: false }
  | {
      findings: [];
      unavailable: true;
      detail: string;
    };

const FINDING_SELECT =
  "id, link_id, title, url, http_status, detail, kind, checked_at, resolved_at, run_id";

/** True when PostgREST / Postgres reports the findings table is missing. */
export function isLinkHealthTableMissing(error: {
  code?: string;
  message?: string;
}): boolean {
  return isMissingRelationError(error);
}

/**
 * List open findings (resolved_at IS NULL), newest check first.
 * Missing table → empty list + unavailable flag (do not throw 500 upstream).
 */
export async function listOpenLinkHealthFindings(): Promise<ListOpenFindingsResult> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("link_health_findings")
    .select(FINDING_SELECT)
    .is("resolved_at", null)
    .order("checked_at", { ascending: false });

  if (error) {
    if (isLinkHealthTableMissing(error)) {
      return {
        findings: [],
        unavailable: true,
        detail:
          error.message ||
          "link_health_findings table is missing; apply scripts/migration-link-health.sql",
      };
    }
    logger.error(
      "listOpenLinkHealthFindings failed",
      { source: "repositories/link-health" },
      error
    );
    throw new Error("list_link_health_findings_failed");
  }

  return {
    findings: (data ?? []) as LinkHealthFinding[],
  };
}

/** Mark a single finding resolved (manual ops only; CLI never auto-resolves). */
export async function resolveLinkHealthFinding(
  id: string
): Promise<{ ok: true } | { error: string }> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("link_health_findings")
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", id)
    .is("resolved_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    if (isLinkHealthTableMissing(error)) {
      return {
        error:
          "link_health_findings 表不存在，请先执行 scripts/migration-link-health.sql",
      };
    }
    logger.error(
      "resolveLinkHealthFinding failed",
      { source: "repositories/link-health", id },
      error
    );
    return { error: "标记已处理失败" };
  }

  if (!data) {
    return { error: "记录不存在或已处理" };
  }

  return { ok: true };
}

type UpsertRow = {
  link_id: string | null;
  title: string;
  url: string;
  http_status: string;
  detail: string | null;
  kind: "broken" | "redirect";
  checked_at: string;
  run_id: string | null;
};

function asHttpStatus(status: string | number): string {
  return String(status);
}

function normalizeLinkId(id: string | null | undefined): string | null {
  if (!id || typeof id !== "string") return null;
  const trimmed = id.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Upsert open findings from a check-links JSON report.
 *
 * Strategy: for each broken/redirect item, if an open row exists for the same
 * link_id+kind, update status/detail/checked_at; otherwise insert.
 * Does NOT auto-resolve open findings that recovered in this run.
 */
export async function replaceOrUpsertFindingsFromReport(
  report: LinkHealthReport,
  runId?: string | null
): Promise<{ upserted: number } | { error: string }> {
  const supabase = createServiceRoleClient();
  const checkedAt = report.generatedAt || new Date().toISOString();
  const effectiveRunId = runId ?? checkedAt.slice(0, 10);

  const rows: UpsertRow[] = [];

  for (const item of report.broken ?? []) {
    rows.push({
      link_id: normalizeLinkId(item.id),
      title: item.title,
      url: item.url,
      http_status: asHttpStatus(item.status),
      detail: item.error ?? null,
      kind: "broken",
      checked_at: checkedAt,
      run_id: effectiveRunId,
    });
  }

  for (const item of report.redirects ?? []) {
    rows.push({
      link_id: normalizeLinkId(item.id),
      title: item.title,
      url: item.url,
      http_status: asHttpStatus(item.status),
      detail: item.location ?? null,
      kind: "redirect",
      checked_at: checkedAt,
      run_id: effectiveRunId,
    });
  }

  if (rows.length === 0) {
    return { upserted: 0 };
  }

  let upserted = 0;

  for (const row of rows) {
    if (row.link_id) {
      const { data: existing, error: findError } = await supabase
        .from("link_health_findings")
        .select("id")
        .eq("link_id", row.link_id)
        .eq("kind", row.kind)
        .is("resolved_at", null)
        .maybeSingle();

      if (findError) {
        if (isLinkHealthTableMissing(findError)) {
          return {
            error:
              "link_health_findings 表不存在，请先执行 scripts/migration-link-health.sql",
          };
        }
        logger.error(
          "replaceOrUpsertFindingsFromReport find failed",
          { source: "repositories/link-health", linkId: row.link_id },
          findError
        );
        return { error: "导入 findings 失败" };
      }

      if (existing?.id) {
        const { error: updateError } = await supabase
          .from("link_health_findings")
          .update({
            title: row.title,
            url: row.url,
            http_status: row.http_status,
            detail: row.detail,
            checked_at: row.checked_at,
            run_id: row.run_id,
          })
          .eq("id", existing.id);

        if (updateError) {
          logger.error(
            "replaceOrUpsertFindingsFromReport update failed",
            { source: "repositories/link-health", id: existing.id },
            updateError
          );
          return { error: "导入 findings 失败" };
        }
        upserted += 1;
        continue;
      }
    }

    const { error: insertError } = await supabase
      .from("link_health_findings")
      .insert(row);

    if (insertError) {
      if (isLinkHealthTableMissing(insertError)) {
        return {
          error:
            "link_health_findings 表不存在，请先执行 scripts/migration-link-health.sql",
        };
      }
      logger.error(
        "replaceOrUpsertFindingsFromReport insert failed",
        { source: "repositories/link-health", kind: row.kind },
        insertError
      );
      return { error: "导入 findings 失败" };
    }
    upserted += 1;
  }

  return { upserted };
}
