/**
 * Content-Security-Policy builders (ChronoPortal / nav-site).
 *
 * Static headers (next.config) use these by default.
 * Optional dynamic/nonce path (proxy + CSP_DYNAMIC=1) reuses the same builders
 * so Enforcing / Report-Only stay in lockstep.
 *
 * Env flags (see .env.local.example + docs/csp-t9-decision-2026-07-22.md):
 * - CSP_REPORT_ONLY=0           disable Report-Only header
 * - CSP_SCRIPT_UNSAFE_INLINE=0  drop script 'unsafe-inline' from Enforcing (default on)
 * - CSP_DYNAMIC=1               middleware owns CSP (enables per-request nonce)
 */

export type CspBuildOptions = {
  isDev?: boolean;
  /** When true, Enforcing script-src includes 'unsafe-inline' (production default). */
  scriptUnsafeInline?: boolean;
  /** Optional CSP nonce (without "nonce-" prefix). */
  nonce?: string | null;
};

export type CspFlags = {
  reportOnlyEnabled: boolean;
  /** Default true — keep 'unsafe-inline' until T9 cutover. */
  scriptUnsafeInline: boolean;
  /** When true, proxy/middleware emits CSP (+ nonce); next.config skips CSP. */
  dynamic: boolean;
};

const TRUE = new Set(["1", "true", "yes", "on"]);
const FALSE = new Set(["0", "false", "no", "off"]);

function parseBool(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined || raw === "") return defaultValue;
  const v = raw.trim().toLowerCase();
  if (TRUE.has(v)) return true;
  if (FALSE.has(v)) return false;
  return defaultValue;
}

/** Read CSP feature flags from an env-like object (testable). */
export function readCspFlags(
  env: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >
): CspFlags {
  return {
    reportOnlyEnabled: parseBool(env.CSP_REPORT_ONLY, true),
    // Default ON for safety; set CSP_SCRIPT_UNSAFE_INLINE=0 only after nonce/GA cutover.
    scriptUnsafeInline: parseBool(env.CSP_SCRIPT_UNSAFE_INLINE, true),
    dynamic: parseBool(env.CSP_DYNAMIC, false),
  };
}

function buildScriptSrc({
  isDev,
  scriptUnsafeInline,
  nonce,
  allowUnsafeEval,
}: {
  isDev: boolean;
  scriptUnsafeInline: boolean;
  nonce?: string | null;
  allowUnsafeEval: boolean;
}): string {
  const parts = ["script-src", "'self'"];
  if (nonce) {
    parts.push(`'nonce-${nonce}'`);
    // strict-dynamic lets nonce-trusted scripts load children; host allowlist remains fallback.
    parts.push("'strict-dynamic'");
  }
  if (scriptUnsafeInline) {
    // Browsers ignore 'unsafe-inline' when a nonce/hash is present — safe during migration.
    parts.push("'unsafe-inline'");
  }
  if (allowUnsafeEval && isDev) {
    parts.push("'unsafe-eval'");
  }
  parts.push(
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com"
  );
  return parts.join(" ");
}

function sharedBody(isDev: boolean): string[] {
  return [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "connect-src 'self' https://*.supabase.co https://*.ingest.us.sentry.io https://www.google-analytics.com https://region1.google-analytics.com",
    "object-src 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ];
}

/** Enforcing Content-Security-Policy value. */
export function buildEnforcingCsp(options: CspBuildOptions = {}): string {
  const isDev = Boolean(options.isDev);
  const scriptUnsafeInline = options.scriptUnsafeInline !== false;
  const nonce = options.nonce?.trim() || null;

  const body = sharedBody(isDev);
  // Insert script-src after default-src
  const script = buildScriptSrc({
    isDev,
    scriptUnsafeInline,
    nonce,
    allowUnsafeEval: true,
  });
  return [body[0], script, ...body.slice(1)].join("; ");
}

/**
 * Report-Only policy: no script 'unsafe-inline' / 'unsafe-eval'.
 * Always reports to /api/csp-report.
 */
export function buildReportOnlyCsp(options: CspBuildOptions = {}): string {
  const isDev = Boolean(options.isDev);
  const nonce = options.nonce?.trim() || null;
  const body = sharedBody(isDev).filter((d) => !d.startsWith("upgrade-insecure"));
  const script = buildScriptSrc({
    isDev,
    scriptUnsafeInline: false,
    nonce,
    allowUnsafeEval: false,
  });
  return [body[0], script, ...body.slice(1), "report-uri /api/csp-report"].join(
    "; "
  );
}

/** Header pairs for next.config `headers()` or middleware. */
export function buildCspHeaderPairs(
  options: CspBuildOptions & { reportOnlyEnabled?: boolean } = {}
): Array<{ key: string; value: string }> {
  const reportOnlyEnabled = options.reportOnlyEnabled !== false;
  const pairs: Array<{ key: string; value: string }> = [
    {
      key: "Content-Security-Policy",
      value: buildEnforcingCsp(options),
    },
  ];
  if (reportOnlyEnabled) {
    pairs.push({
      key: "Content-Security-Policy-Report-Only",
      value: buildReportOnlyCsp(options),
    });
  }
  return pairs;
}

/** Cryptographically strong nonce for CSP (base64url). */
export function createCspNonce(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(arr);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(arr).toString("base64url");
  }
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Request/response header name for the per-request CSP nonce. */
export const CSP_NONCE_HEADER = "x-nonce";

export type DynamicCspAttachment = {
  nonce: string;
  pairs: Array<{ key: string; value: string }>;
  flags: CspFlags;
};

/**
 * When `CSP_DYNAMIC=1`, produce a per-request nonce + CSP header pairs for proxy.
 * Returns null when dynamic mode is off (static CSP stays in next.config).
 *
 * Preview-only path — production default keeps CSP_DYNAMIC off.
 */
export function createDynamicCspAttachment(
  env: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >,
  options: { isDev?: boolean; nonce?: string } = {}
): DynamicCspAttachment | null {
  const flags = readCspFlags(env);
  if (!flags.dynamic) return null;

  const nonce = (options.nonce?.trim() || createCspNonce()).trim();
  if (!nonce) return null;

  const isDev =
    options.isDev ?? env.NODE_ENV !== "production";

  const pairs = buildCspHeaderPairs({
    isDev,
    scriptUnsafeInline: flags.scriptUnsafeInline,
    reportOnlyEnabled: flags.reportOnlyEnabled,
    nonce,
  });

  return { nonce, pairs, flags };
}
