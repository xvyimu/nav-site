/**
 * Read-only security-headers probe (Wave8).
 *
 * Prints key response security headers for a configurable BASE URL.
 * Does not change next.config, proxy, env, or any control plane.
 *
 * Default BASE is http://127.0.0.1:3264 (local dev). Production custom
 * domain is blocked as a canary target unless --allow-production is set
 * (or HEADERS_PROBE_ALLOW_PRODUCTION=1).
 *
 * Usage:
 *   node scripts/probe-security-headers.mjs
 *   node scripts/probe-security-headers.mjs --base-url https://preview.example.vercel.app
 *   node scripts/probe-security-headers.mjs --base-url https://yuanjia1314.ccwu.cc --allow-production
 *   pnpm run probe:headers -- --base-url http://127.0.0.1:3264
 *
 * Exit:
 *   0  — request ok (and optional --expect-* checks passed)
 *   1  — blocked base / network / HTTP non-2xx / expectation miss
 *   2  — bad args
 */

import { pathToFileURL } from "node:url";

/** Production custom domain — blocked as canary BASE by default. */
export const BLOCKED_PRODUCTION_HOSTS = new Set([
  "yuanjia1314.ccwu.cc",
  "www.yuanjia1314.ccwu.cc",
]);

export const DEFAULT_BASE_URL = "http://127.0.0.1:3264";
export const DEFAULT_PATH = "/";
export const DEFAULT_TIMEOUT_MS = 15_000;

/** Headers we always surface (case-insensitive lookup). */
export const KEY_HEADER_NAMES = [
  "content-security-policy",
  "content-security-policy-report-only",
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "cross-origin-opener-policy",
  "cross-origin-resource-policy",
  "cross-origin-embedder-policy",
  "x-xss-protection",
  "expect-ct",
];

/** Repo contract from next.config.ts (static path; not a live assertion by default). */
export const REPO_HEADER_CONTRACT = {
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function normalize(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function parseBoolean(value) {
  return TRUE_VALUES.has(normalize(value));
}

export function readArgValue(args, name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);

  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

export function parsePositiveNumber(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} [env]
 */
export function readConfig(args = process.argv.slice(2), env = process.env) {
  if (args.includes("--help") || args.includes("-h")) {
    return { help: true };
  }

  const baseUrl =
    readArgValue(args, "--base-url") ||
    env.HEADERS_PROBE_BASE_URL ||
    env.BASE_URL ||
    DEFAULT_BASE_URL;

  const path =
    readArgValue(args, "--path") || env.HEADERS_PROBE_PATH || DEFAULT_PATH;

  const timeoutMs = parsePositiveNumber(
    readArgValue(args, "--timeout-ms") || env.HEADERS_PROBE_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS
  );

  const allowProduction =
    args.includes("--allow-production") ||
    parseBoolean(env.HEADERS_PROBE_ALLOW_PRODUCTION);

  const compareRepo =
    args.includes("--compare-repo") ||
    parseBoolean(env.HEADERS_PROBE_COMPARE_REPO);

  const json =
    args.includes("--json") || parseBoolean(env.HEADERS_PROBE_JSON);

  return {
    help: false,
    baseUrl,
    path,
    timeoutMs,
    allowProduction,
    compareRepo,
    json,
  };
}

/**
 * @param {string} baseUrl
 * @returns {{ host: string | null, blocked: boolean, reason?: string }}
 */
export function evaluateBaseUrl(baseUrl, { allowProduction = false } = {}) {
  let host = null;
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return {
      host: null,
      blocked: true,
      reason: `invalid BASE URL: ${baseUrl}`,
    };
  }

  if (BLOCKED_PRODUCTION_HOSTS.has(host) && !allowProduction) {
    return {
      host,
      blocked: true,
      reason:
        `BASE host "${host}" is the production custom domain. ` +
        `Default canary policy forbids it. Pass --allow-production ` +
        `(or HEADERS_PROBE_ALLOW_PRODUCTION=1) for an explicit read-only production observation, ` +
        `or use a Preview / localhost URL.`,
    };
  }

  return { host, blocked: false };
}

/**
 * @param {Headers | Record<string, string> | Iterable<[string, string]>} headers
 * @returns {Record<string, string>}
 */
export function pickSecurityHeaders(headers) {
  /** @type {Record<string, string>} */
  const lower = {};

  if (headers && typeof headers.get === "function") {
    for (const name of KEY_HEADER_NAMES) {
      const value = headers.get(name);
      if (value != null && value !== "") lower[name] = value;
    }
    // Capture any other x- / security-ish headers for the dump
    if (typeof headers.forEach === "function") {
      headers.forEach((value, key) => {
        const k = String(key).toLowerCase();
        if (
          (k.startsWith("x-") ||
            k.includes("security") ||
            k.includes("policy") ||
            k === "strict-transport-security" ||
            k === "expect-ct") &&
          lower[k] === undefined
        ) {
          lower[k] = value;
        }
      });
    }
    return lower;
  }

  if (headers && typeof headers[Symbol.iterator] === "function") {
    for (const entry of headers) {
      const key = String(entry?.[0] ?? "").toLowerCase();
      const value = String(entry?.[1] ?? "");
      if (!key) continue;
      if (
        KEY_HEADER_NAMES.includes(key) ||
        key.startsWith("x-") ||
        key.includes("policy") ||
        key === "strict-transport-security" ||
        key === "expect-ct"
      ) {
        lower[key] = value;
      }
    }
    return lower;
  }

  if (headers && typeof headers === "object") {
    for (const [key, value] of Object.entries(headers)) {
      const k = key.toLowerCase();
      if (
        KEY_HEADER_NAMES.includes(k) ||
        k.startsWith("x-") ||
        k.includes("policy") ||
        k === "strict-transport-security" ||
        k === "expect-ct"
      ) {
        lower[k] = String(value ?? "");
      }
    }
  }

  return lower;
}

/**
 * Compare live headers against next.config contract (informational mismatches).
 * @param {Record<string, string>} live
 * @param {Record<string, string>} [contract]
 */
export function compareToRepoContract(live, contract = REPO_HEADER_CONTRACT) {
  /** @type {{ header: string, expected: string, actual: string | null, match: boolean }[]} */
  const rows = [];
  for (const [header, expected] of Object.entries(contract)) {
    const actual = live[header] ?? null;
    rows.push({
      header,
      expected,
      actual,
      match:
        actual != null &&
        actual.trim().toLowerCase() === expected.trim().toLowerCase(),
    });
  }
  return rows;
}

/**
 * @param {object} opts
 * @param {string} opts.baseUrl
 * @param {string} [opts.path]
 * @param {number} [opts.timeoutMs]
 * @param {boolean} [opts.allowProduction]
 * @param {boolean} [opts.compareRepo]
 * @param {typeof fetch} [opts.fetchImpl]
 */
export async function probeSecurityHeaders({
  baseUrl,
  path = DEFAULT_PATH,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  allowProduction = false,
  compareRepo = false,
  fetchImpl = globalThis.fetch,
} = {}) {
  const gate = evaluateBaseUrl(baseUrl, { allowProduction });
  if (gate.blocked) {
    return {
      ok: false,
      blocked: true,
      reason: gate.reason,
      host: gate.host,
      baseUrl,
      path,
      status: null,
      headers: {},
      compare: [],
    };
  }

  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = String(path || "/").replace(/^\/+/, "") || "";
  const url = new URL(normalizedPath, normalizedBase);
  // Light cache-bust so CDN edges do not always serve a sticky HEAD sample
  url.searchParams.set("_hdr", Date.now().toString(36));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(url.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "chrono-probe-security-headers/1.0",
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
    });

    const headers = pickSecurityHeaders(res.headers);
    const compare = compareRepo ? compareToRepoContract(headers) : [];
    const ok = res.status >= 200 && res.status < 300;

    return {
      ok,
      blocked: false,
      reason: ok ? null : `HTTP ${res.status}`,
      host: gate.host,
      baseUrl,
      path,
      url: url.toString(),
      status: res.status,
      headers,
      compare,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      blocked: false,
      reason: message,
      host: gate.host,
      baseUrl,
      path,
      status: null,
      headers: {},
      compare: [],
    };
  } finally {
    clearTimeout(timer);
  }
}

function printHuman(result, { compareRepo }) {
  const lines = [
    `probe-security-headers · base=${result.baseUrl} path=${result.path}`,
    `host=${result.host ?? "?"} status=${result.status ?? "n/a"} ok=${result.ok}`,
  ];
  if (result.blocked) {
    lines.push(`BLOCKED: ${result.reason}`);
  } else if (result.reason && !result.ok) {
    lines.push(`ERROR: ${result.reason}`);
  }

  lines.push("--- key security headers ---");
  const keys = Object.keys(result.headers).sort();
  if (keys.length === 0) {
    lines.push("(none observed)");
  } else {
    for (const key of keys) {
      const value = result.headers[key];
      // Truncate very long CSP for terminal readability
      const display =
        value.length > 240 ? `${value.slice(0, 240)}…(+${value.length - 240})` : value;
      lines.push(`${key}: ${display}`);
    }
  }

  if (compareRepo && result.compare?.length) {
    lines.push("--- vs next.config contract ---");
    for (const row of result.compare) {
      const mark = row.match ? "OK" : "DRIFT";
      lines.push(
        `[${mark}] ${row.header}: live=${row.actual ?? "(missing)"} | repo=${row.expected}`
      );
    }
  }

  lines.push(
    "note: read-only; does not mutate next.config / proxy / env. " +
      "Production CSP_DYNAMIC / RLS remain deferred."
  );

  console.log(lines.join("\n"));
}

function printHelp() {
  console.log(`Usage: node scripts/probe-security-headers.mjs [options]

Options:
  --base-url <url>     Target origin (default: ${DEFAULT_BASE_URL})
  --path <path>        Request path (default: ${DEFAULT_PATH})
  --timeout-ms <n>     Fetch timeout (default: ${DEFAULT_TIMEOUT_MS})
  --allow-production   Permit production custom domain as BASE
  --compare-repo       Diff live values vs next.config contract
  --json               Machine-readable output
  -h, --help           Show this help

Env:
  HEADERS_PROBE_BASE_URL
  HEADERS_PROBE_PATH
  HEADERS_PROBE_TIMEOUT_MS
  HEADERS_PROBE_ALLOW_PRODUCTION=1
  HEADERS_PROBE_COMPARE_REPO=1
  HEADERS_PROBE_JSON=1

Examples:
  node scripts/probe-security-headers.mjs
  node scripts/probe-security-headers.mjs --base-url https://xxx.vercel.app --compare-repo
  node scripts/probe-security-headers.mjs --base-url https://yuanjia1314.ccwu.cc --allow-production --compare-repo
`);
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const config = readConfig(args, env);
  if (config.help) {
    printHelp();
    return 0;
  }

  const result = await probeSecurityHeaders({
    baseUrl: config.baseUrl,
    path: config.path,
    timeoutMs: config.timeoutMs,
    allowProduction: config.allowProduction,
    compareRepo: config.compareRepo,
  });

  if (config.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result, { compareRepo: config.compareRepo });
  }

  if (result.blocked) return 1;
  if (!result.ok) return 1;
  if (config.compareRepo && result.compare?.some((row) => !row.match)) {
    // Drift is evidence, not a hard fail — operators need the printout.
    // Still exit 0 so CI can collect as-is vs target without failing the job.
    return 0;
  }
  return 0;
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error);
      process.exitCode = 1;
    }
  );
}
