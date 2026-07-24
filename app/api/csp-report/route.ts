import { NextResponse } from "next/server";
import { captureMessage } from "@sentry/nextjs";
import { toPathOnlyUri } from "@/lib/csp-report-uri";
import { checkDistributedRateLimit } from "@/lib/rate-limit-distributed";
import { getClientIp } from "@/lib/utils";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Soft cap so a misbehaving browser cannot flood logs. */
const MAX_BODY_BYTES = 8_192;
const SAMPLE_EVERY = 20;

type CspReportBody = {
  "csp-report"?: Record<string, unknown>;
  [key: string]: unknown;
};

/**
 * CSP Report-Only collector (P1-3).
 * Accepts browser CSP violation reports; never blocks page loads.
 * Sampling + rate-limit keep volume bounded.
 * Sampled hits go to structured logs AND Sentry (queryable; T9 evidence).
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  // windowMs first, then maxAttempts (same order as search/favicon/web-vitals)
  const { allowed } = await checkDistributedRateLimit(
    `csp-report:${ip}`,
    60_000,
    60
  );
  if (!allowed) {
    // Still 204 (CSP collectors treat non-2xx poorly); advertise throttle via Retry-After.
    return new NextResponse(null, {
      status: 204,
      headers: { "Retry-After": "60", "Cache-Control": "no-store" },
    });
  }

  const raw = await request.text();
  if (!raw || raw.length > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 204 });
  }

  let parsed: CspReportBody;
  try {
    parsed = JSON.parse(raw) as CspReportBody;
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const report =
    (parsed["csp-report"] as Record<string, unknown> | undefined) ??
    (typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : null);

  if (!report) {
    return new NextResponse(null, { status: 204 });
  }

  // Deterministic light sampling by violated directive + blocked uri hash
  const directive = String(report["violated-directive"] ?? report["effective-directive"] ?? "");
  const blocked = String(report["blocked-uri"] ?? "");
  const sampleKey = `${directive}|${blocked}`;
  let hash = 0;
  for (let i = 0; i < sampleKey.length; i += 1) {
    hash = (hash * 31 + sampleKey.charCodeAt(i)) >>> 0;
  }
  if (hash % SAMPLE_EVERY !== 0) {
    return new NextResponse(null, { status: 204 });
  }

  // Sanitize only at emit time (sampling above may still use raw for stability).
  const documentUri = toPathOnlyUri(report["document-uri"] ?? report["documentURI"]);
  const blockedUri = toPathOnlyUri(blocked);
  const disposition = String(report["disposition"] ?? "report");
  const context = {
    source: "csp-report",
    documentUri,
    violatedDirective: directive,
    blockedUri,
    originalPolicy: report["original-policy"] ?? undefined,
    disposition,
  };

  logger.warn("CSP report-only violation (sampled)", context);

  // Mirror web-vitals: tags for Sentry Issues aggregation; no DB write.
  try {
    captureMessage(`csp-report: ${directive || "unknown"}`, {
      level: "warning",
      tags: {
        source: "csp-report",
        violatedDirective: directive.slice(0, 64) || "unknown",
        disposition: disposition.slice(0, 32),
      },
      extra: {
        documentUri,
        blockedUri,
        originalPolicy: report["original-policy"] ?? undefined,
      },
      fingerprint: ["csp-report", directive || "unknown", blockedUri.slice(0, 120) || "none"],
    });
  } catch {
    // Never fail the browser report endpoint because of Sentry.
  }

  return new NextResponse(null, { status: 204 });
}

/** Browsers may probe with GET; stay silent. */
export async function GET() {
  return new NextResponse(null, { status: 204 });
}
