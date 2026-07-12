import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const DEFAULT_BASE_URL = "https://nav-site-kappa.vercel.app";
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 750;
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

const ENDPOINTS = [
  { name: "home", path: "/", contentType: /text\/html/i },
  { name: "health", path: "/api/health", contentType: /application\/json/i, json: "health" },
  { name: "search", path: "/api/search?q=ai&limit=5", contentType: /application\/json/i, json: "search" },
  { name: "tool-detail", path: "/tool/figma", contentType: /text\/html/i },
  { name: "sitemap", path: "/sitemap.xml", contentType: /(application|text)\/xml/i },
  { name: "robots", path: "/robots.txt", contentType: /text\/plain/i },
];

const BUILD_INFO_ENDPOINT = {
  name: "build-info",
  path: "/build-info.json",
  contentType: /application\/json/i,
  json: "build-info",
};

function normalize(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function parseBoolean(value) {
  return TRUE_VALUES.has(normalize(value));
}

function normalizeProxyUrl(raw) {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw) || /^socks/i.test(raw)) return raw;
  return `http://${raw}`;
}

/**
 * Windows IE/system proxy (HKCU Internet Settings) is used by PowerShell /
 * WinINet but NOT by Node undici. Without this, direct HTTPS to Vercel often
 * hits UND_ERR_CONNECT_TIMEOUT when a local client proxy (e.g. FlClash :7890)
 * is the only egress path.
 *
 * Order: explicit HTTP(S)_PROXY / ALL_PROXY → Windows registry ProxyServer.
 * Skip when PROBE_NO_PROXY=1 / --no-proxy.
 */
export function resolveSystemProxyUrl(env = process.env) {
  if (parseBoolean(env.PROBE_NO_PROXY) || parseBoolean(env.NO_PROXY_FORCE)) {
    return null;
  }

  const explicit =
    env.HTTPS_PROXY ||
    env.https_proxy ||
    env.HTTP_PROXY ||
    env.http_proxy ||
    env.ALL_PROXY ||
    env.all_proxy;
  if (typeof explicit === "string" && explicit.trim()) {
    return normalizeProxyUrl(explicit.trim());
  }

  if (process.platform !== "win32") return null;

  try {
    const ps = [
      "$p = Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -ErrorAction Stop;",
      "if ([int]$p.ProxyEnable -ne 1) { exit 0 };",
      "Write-Output $p.ProxyServer",
    ].join(" ");
    const out = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", ps],
      { encoding: "utf8", timeout: 5000, windowsHide: true }
    ).trim();
    if (!out) return null;
    // ProxyServer may be "host:port" or "http=host:port;https=host:port"
    const httpsPart = out
      .split(";")
      .map((s) => s.trim())
      .find((s) => /^https?=/i.test(s));
    const raw = httpsPart ? httpsPart.split("=").slice(1).join("=") : out;
    return normalizeProxyUrl(raw);
  } catch {
    return null;
  }
}

/**
 * Apply system/env proxy to undici global dispatcher (CLI only).
 * Uses createRequire('undici') so vitest static analysis never resolves the package.
 */
export function bootstrapProbeProxy({ env = process.env, args = [], logger = console } = {}) {
  if (args.includes("--no-proxy") || parseBoolean(env.PROBE_NO_PROXY)) {
    return null;
  }

  const proxyUrl = resolveSystemProxyUrl(env);
  if (!proxyUrl) return null;

  try {
    const require = createRequire(import.meta.url);
    const undici = require("undici");
    undici.setGlobalDispatcher(new undici.ProxyAgent(proxyUrl));
    if (!parseBoolean(env.PROBE_PROXY_QUIET)) {
      const safe = proxyUrl.replace(/\/\/([^/@]+)@/, "//***@");
      logger.log(`Production probe proxy: ${safe}`);
    }
    return proxyUrl;
  } catch (error) {
    logger.error(`Failed to set probe proxy ${proxyUrl}: ${errorMessage(error)}`);
    return null;
  }
}

function parsePositiveNumber(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInteger(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function readArgValue(args, name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);

  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

export function readConfigFromEnv(env = process.env, args = process.argv.slice(2)) {
  return {
    baseUrl: readArgValue(args, "--base-url") || env.PRODUCTION_BASE_URL || DEFAULT_BASE_URL,
    timeoutMs: parsePositiveNumber(
      readArgValue(args, "--timeout-ms") || env.PRODUCTION_PROBE_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS
    ),
    expectEmbeddingSkipped:
      args.includes("--expect-embedding-skipped") ||
      parseBoolean(env.PRODUCTION_EXPECT_EMBEDDING_SKIPPED),
    expectedCommit: readArgValue(args, "--expect-commit") || env.PRODUCTION_EXPECT_COMMIT || "",
    retries: parseNonNegativeInteger(
      readArgValue(args, "--retries") || env.PRODUCTION_PROBE_RETRIES,
      DEFAULT_RETRIES
    ),
    retryDelayMs: parsePositiveNumber(
      readArgValue(args, "--retry-delay-ms") || env.PRODUCTION_PROBE_RETRY_DELAY_MS,
      DEFAULT_RETRY_DELAY_MS
    ),
  };
}

export function makeProbeUrl(baseUrl, path) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.replace(/^\/+/, "");
  return new URL(normalizedPath, normalizedBase).toString();
}

function getHeader(headers, name) {
  if (typeof headers?.get === "function") return headers.get(name) || "";
  return headers?.[name] || headers?.[name.toLowerCase()] || "";
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function normalizeCommit(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function commitMatches(actual, expected) {
  const normalizedActual = normalizeCommit(actual);
  const normalizedExpected = normalizeCommit(expected);
  if (!normalizedExpected) return true;
  if (!normalizedActual) return false;
  return (
    normalizedActual === normalizedExpected ||
    normalizedActual.startsWith(normalizedExpected) ||
    normalizedExpected.startsWith(normalizedActual)
  );
}

export function validateHealthPayload(payload, { expectEmbeddingSkipped } = {}) {
  const failures = [];

  if (payload?.status !== "healthy") {
    failures.push(`expected health status healthy, got ${payload?.status ?? "missing"}`);
  }

  const databaseStatus = payload?.checks?.database?.status;
  if (databaseStatus !== "ok") {
    failures.push(`expected database check ok, got ${databaseStatus ?? "missing"}`);
  }

  const envStatus = payload?.checks?.env?.status;
  if (envStatus !== "ok") {
    failures.push(`expected env check ok, got ${envStatus ?? "missing"}`);
  }

  if (expectEmbeddingSkipped) {
    const embeddingStatus = payload?.checks?.embedding?.status;
    if (embeddingStatus !== "skipped") {
      failures.push(`expected embedding check skipped, got ${embeddingStatus ?? "missing"}`);
    }
  }

  const resourceLibrarySearchStatus = payload?.checks?.resourceLibrarySearch?.status;
  if (
    resourceLibrarySearchStatus !== undefined &&
    resourceLibrarySearchStatus !== "ok" &&
    resourceLibrarySearchStatus !== "skipped"
  ) {
    failures.push(
      `expected resource library search check ok or skipped, got ${resourceLibrarySearchStatus}`
    );
  }

  return failures;
}

export function validateBuildInfoPayload(payload, { expectedCommit } = {}) {
  const failures = [];

  if (expectedCommit && !commitMatches(payload?.commit, expectedCommit)) {
    failures.push(`expected build commit ${expectedCommit}, got ${payload?.commit ?? "missing"}`);
  }

  return failures;
}

export function validateSearchPayload(payload) {
  const failures = [];

  if (!Array.isArray(payload?.results)) {
    failures.push("expected search results array");
  }

  if (typeof payload?.total !== "number") {
    failures.push("expected numeric search total");
  }

  if (payload?.mode !== "fuse" && payload?.mode !== "semantic") {
    failures.push(`expected search mode fuse or semantic, got ${payload?.mode ?? "missing"}`);
  }

  return failures;
}

function isRetryableResult(result) {
  return (
    !result.ok &&
    (result.status === 0 ||
      result.status === 408 ||
      result.status === 425 ||
      result.status === 429 ||
      result.status >= 500)
  );
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson(response) {
  try {
    return { payload: await response.json() };
  } catch (error) {
    return { failure: `invalid JSON response: ${errorMessage(error)}` };
  }
}

async function probeEndpointOnce(endpoint, {
  baseUrl,
  timeoutMs,
  expectEmbeddingSkipped,
  expectedCommit,
  fetchImpl = fetch,
}) {
  const url = makeProbeUrl(baseUrl, endpoint.path);

  try {
    const response = await fetchImpl(url, {
      headers: {
        "User-Agent": "nav-site-production-probe",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const contentType = getHeader(response.headers, "content-type");
    const failures = [];

    if (!response.ok) {
      failures.push(`HTTP ${response.status}`);
    }

    if (endpoint.contentType && !endpoint.contentType.test(contentType)) {
      failures.push(`unexpected content-type ${contentType || "missing"}`);
    }

    if (endpoint.json === "health") {
      const { payload, failure } = await readJson(response);
      if (failure) {
        failures.push(failure);
      } else {
        failures.push(...validateHealthPayload(payload, { expectEmbeddingSkipped }));
      }
    }

    if (endpoint.json === "build-info") {
      const { payload, failure } = await readJson(response);
      if (failure) {
        failures.push(failure);
      } else {
        failures.push(...validateBuildInfoPayload(payload, { expectedCommit }));
      }
    }

    if (endpoint.json === "search") {
      const { payload, failure } = await readJson(response);
      if (failure) {
        failures.push(failure);
      } else {
        failures.push(...validateSearchPayload(payload));
      }
    }

    return {
      name: endpoint.name,
      url,
      status: response.status,
      ok: failures.length === 0,
      detail: failures.length === 0 ? "ok" : failures.join("; "),
      attempts: 1,
    };
  } catch (error) {
    return {
      name: endpoint.name,
      url,
      status: 0,
      ok: false,
      detail: errorMessage(error),
      attempts: 1,
    };
  }
}

export async function probeEndpoint(endpoint, {
  retries = DEFAULT_RETRIES,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  waitImpl = wait,
  ...options
}) {
  const maxAttempts = retries + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await probeEndpointOnce(endpoint, options);
    result.attempts = attempt;

    if (!isRetryableResult(result) || attempt === maxAttempts) {
      return result;
    }

    await waitImpl(retryDelayMs);
  }

  throw new Error("production probe retry loop exited unexpectedly");
}

export async function runProductionProbe({
  config = readConfigFromEnv(),
  fetchImpl = fetch,
  waitImpl = wait,
  endpoints = ENDPOINTS,
} = {}) {
  const results = [];
  const probeEndpoints = config.expectedCommit
    ? [...endpoints, BUILD_INFO_ENDPOINT]
    : endpoints;

  for (const endpoint of probeEndpoints) {
    results.push(await probeEndpoint(endpoint, { ...config, fetchImpl, waitImpl }));
  }

  return results;
}

export function summarizeResults(results) {
  return results.map((result) => {
    const mark = result.ok ? "PASS" : "FAIL";
    const attempts = result.attempts > 1 ? ` attempts=${result.attempts}` : "";
    return `[${mark}] ${result.name} ${result.status || "ERR"} ${result.detail}${attempts}`;
  });
}

export function assertProbePassed(results) {
  const failures = results.filter((result) => !result.ok);
  if (failures.length === 0) return;

  throw new Error(
    `Production probe failed: ${failures.map((result) => `${result.name}: ${result.detail}`).join("; ")}`
  );
}

export async function main({ env = process.env, args = process.argv.slice(2), fetchImpl = fetch, logger = console } = {}) {
  // Only bootstrap proxy when using the real global fetch (not injected mocks).
  if (fetchImpl === fetch) {
    bootstrapProbeProxy({ env, args, logger });
  }
  const config = readConfigFromEnv(env, args);
  const results = await runProductionProbe({ config, fetchImpl });
  logger.log(`Production probe base: ${config.baseUrl}`);
  for (const line of summarizeResults(results)) logger.log(line);
  assertProbePassed(results);
  return results;
}

function isCliInvocation() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isCliInvocation()) {
  main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
