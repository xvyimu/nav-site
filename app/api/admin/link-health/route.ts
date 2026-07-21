import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminGet, withAdminWrite } from "@/lib/with-admin";
import {
  listOpenLinkHealthFindings,
  resolveLinkHealthFinding,
  replaceOrUpsertFindingsFromReport,
  type LinkHealthReport,
} from "@/lib/repositories/link-health";

const reportItemSchema = z.object({
  id: z.string().uuid().nullish(),
  title: z.string().min(1).max(500),
  url: z.string().min(1).max(2000),
  status: z.union([z.string(), z.number()]),
  error: z.string().max(2000).optional(),
  location: z.string().max(2000).optional(),
});

const reportSchema = z.object({
  generatedAt: z.string().min(1).max(64),
  total: z.number().int().min(0),
  ok: z.number().int().min(0),
  broken: z.array(reportItemSchema).default([]),
  redirects: z.array(reportItemSchema).default([]),
});

const postBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("resolve"),
    id: z.string().uuid("ID 格式不正确"),
  }),
  z.object({
    action: z.literal("import"),
    report: reportSchema,
    runId: z.string().max(128).optional(),
  }),
]);

/** List open link-health findings; missing table → 200 + unavailable meta. */
export const GET = withAdminGet(async () => {
  const startedAt = performance.now();
  const result = await listOpenLinkHealthFindings();

  if ("unavailable" in result && result.unavailable) {
    return NextResponse.json(
      {
        findings: [],
        meta: {
          openCount: 0,
          unavailable: true,
          detail: result.detail,
        },
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "Server-Timing": `total;dur=${(performance.now() - startedAt).toFixed(1)}`,
        },
      }
    );
  }

  const findings = result.findings;
  return NextResponse.json(
    {
      findings,
      meta: { openCount: findings.length },
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "Server-Timing": `total;dur=${(performance.now() - startedAt).toFixed(1)}`,
      },
    }
  );
});

/** Resolve one finding or import a check-links JSON report. */
export const POST = withAdminWrite(postBodySchema, async ({ parsed }) => {
  if (parsed.action === "resolve") {
    const result = await resolveLinkHealthFinding(parsed.id);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  }

  // import
  const report = parsed.report as LinkHealthReport;
  const result = await replaceOrUpsertFindingsFromReport(
    report,
    parsed.runId ?? null
  );
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true, upserted: result.upserted });
});
