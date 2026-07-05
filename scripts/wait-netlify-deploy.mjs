import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DEFAULT_TIMEOUT_MS = 8 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 10 * 1000;
const DEFAULT_CREDIT_BLOCK_PREFLIGHT_WINDOW_MS = 30 * 60 * 1000;
const FAILED_STATES = new Set(["error", "failed", "rejected", "skipped", "canceled", "cancelled"]);
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const CREDIT_USAGE_EXCEEDED_PATTERN = /account credit usage exceeded/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function parsePositiveNumber(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value) {
  return TRUE_VALUES.has(normalize(value));
}

export function candidateValues(deploy) {
  return [
    deploy.commit_ref,
    deploy.commit_sha,
    deploy.commit,
    deploy.sha,
    deploy.review_id,
  ]
    .map(normalize)
    .filter(Boolean);
}

export function matchesCommit(deploy, targetSha) {
  const normalizedTargetSha = normalize(targetSha);
  if (!normalizedTargetSha) return false;

  const targetShortSha = normalizedTargetSha.slice(0, 7);
  const values = candidateValues(deploy);
  if (values.length === 0) return false;

  return values.some((value) => {
    if (value === normalizedTargetSha) return true;
    return (
      value.length >= 7 &&
      (normalizedTargetSha.startsWith(value) || value.startsWith(targetShortSha))
    );
  });
}

export function matchesBranch(deploy, targetBranch) {
  if (!targetBranch || !deploy.branch) return true;
  return deploy.branch === targetBranch;
}

export function matchesDeployId(deploy, targetDeployId) {
  if (!targetDeployId) return false;
  return deploy.id === targetDeployId;
}

export function matchesCreatedAfter(deploy, createdAfter) {
  if (!Number.isFinite(createdAfter) || !deploy.created_at) return false;
  return Date.parse(deploy.created_at) >= createdAfter;
}

export function findMatchingDeploy(deploys, { targetSha, targetBranch, targetDeployId, createdAfter }) {
  const targetDeploy = targetDeployId
    ? deploys.find((deploy) => matchesDeployId(deploy, targetDeployId))
    : undefined;
  if (targetDeploy) return targetDeploy;

  return deploys.find(
    (deploy) =>
      matchesBranch(deploy, targetBranch) &&
      (matchesCommit(deploy, targetSha) || matchesCreatedAfter(deploy, createdAfter))
  );
}

export function deployUrl(deploy) {
  return deploy.deploy_ssl_url || deploy.ssl_url || deploy.deploy_url || deploy.url || "";
}

export function deployDetails(deploy) {
  return [deploy.error_message, deploy.failure_reason, deploy.message]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .join("; ");
}

export function isAccountCreditUsageExceeded(deploy) {
  return CREDIT_USAGE_EXCEEDED_PATTERN.test(deployDetails(deploy));
}

export function isRecentDeploy(deploy, nowMs, windowMs) {
  if (!deploy.created_at) return false;
  const createdAt = Date.parse(deploy.created_at);
  return Number.isFinite(createdAt) && nowMs - createdAt <= windowMs;
}

export function findRecentAccountCreditBlockedDeploy(
  deploys,
  { nowMs = Date.now(), windowMs = DEFAULT_CREDIT_BLOCK_PREFLIGHT_WINDOW_MS } = {}
) {
  return deploys.find(
    (deploy) => isAccountCreditUsageExceeded(deploy) && isRecentDeploy(deploy, nowMs, windowMs)
  );
}

export function summarizeDeploy(deploy) {
  const commit = candidateValues(deploy)[0]?.slice(0, 7) || "unknown";
  const branch = deploy.branch || "unknown";
  const url = deployUrl(deploy) || "no-url";
  const details = deployDetails(deploy);
  return `${deploy.id}: state=${deploy.state}, branch=${branch}, commit=${commit}, created_at=${deploy.created_at}, url=${url}${details ? `, details=${details}` : ""}`;
}

export function readConfigFromEnv(env = process.env) {
  const token = env.NETLIFY_AUTH_TOKEN;
  const siteId = env.NETLIFY_SITE_ID;
  const targetSha = env.GITHUB_SHA?.toLowerCase();
  const targetBranch = env.NETLIFY_DEPLOY_BRANCH || env.GITHUB_REF_NAME;
  const createdAfter = env.NETLIFY_DEPLOY_CREATED_AFTER
    ? Date.parse(env.NETLIFY_DEPLOY_CREATED_AFTER)
    : Number.NaN;

  if (!token) {
    throw new Error("NETLIFY_AUTH_TOKEN is not set");
  }

  if (!siteId) {
    throw new Error("NETLIFY_SITE_ID is not set");
  }

  if (!targetSha) {
    throw new Error("GITHUB_SHA is not set");
  }

  return {
    token,
    siteId,
    targetSha,
    targetBranch,
    targetDeployId: env.NETLIFY_DEPLOY_ID,
    triggerBuild: parseBoolean(env.NETLIFY_TRIGGER_BUILD),
    creditBlockPreflight: !parseBoolean(env.NETLIFY_SKIP_CREDIT_BLOCK_PREFLIGHT),
    creditBlockPreflightWindowMs: parsePositiveNumber(
      env.NETLIFY_CREDIT_BLOCK_PREFLIGHT_WINDOW_MS,
      DEFAULT_CREDIT_BLOCK_PREFLIGHT_WINDOW_MS
    ),
    buildBranch: env.NETLIFY_BUILD_BRANCH,
    buildTitle: env.NETLIFY_BUILD_TITLE,
    clearCache: parseBoolean(env.NETLIFY_BUILD_CLEAR_CACHE),
    createdAfter,
    timeoutMs: parsePositiveNumber(env.NETLIFY_DEPLOY_POLL_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    intervalMs: parsePositiveNumber(env.NETLIFY_DEPLOY_POLL_INTERVAL_MS, DEFAULT_INTERVAL_MS),
  };
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "User-Agent": "nav-site-ci",
  };
}

export async function triggerNetlifyBuild({ config, fetchImpl = fetch, logger = console }) {
  const url = new URL(`https://api.netlify.com/api/v1/sites/${encodeURIComponent(config.siteId)}/builds`);
  if (config.buildBranch) url.searchParams.set("branch", config.buildBranch);
  if (config.clearCache) url.searchParams.set("clear_cache", "true");
  url.searchParams.set(
    "title",
    config.buildTitle || `GitHub Actions ${config.targetSha.slice(0, 7)}`
  );

  const response = await fetchImpl(url, {
    method: "POST",
    headers: authHeaders(config.token),
  });

  if (!response.ok) {
    throw new Error(`Netlify build trigger failed with HTTP ${response.status}`);
  }

  const build = await response.json();
  logger.log(
    `[netlify] triggered build: id=${build.id ?? "unknown"}, deploy_id=${build.deploy_id ?? "unknown"}, sha=${build.sha ?? "unknown"}`
  );
  return build;
}

export async function listDeploys({ config, fetchImpl = fetch }) {
  const url = new URL(`https://api.netlify.com/api/v1/sites/${encodeURIComponent(config.siteId)}/deploys`);
  url.searchParams.set("per_page", "50");

  const response = await fetchImpl(url, {
    headers: authHeaders(config.token),
  });

  if (!response.ok) {
    throw new Error(`Netlify deploy lookup failed with HTTP ${response.status}`);
  }

  return response.json();
}

export async function assertNetlifyCreditsAvailable({
  config,
  fetchImpl = fetch,
  logger = console,
  now = Date.now,
}) {
  const deploys = await listDeploys({ config, fetchImpl });
  const blockedDeploy = findRecentAccountCreditBlockedDeploy(deploys, {
    nowMs: now(),
    windowMs: config.creditBlockPreflightWindowMs,
  });

  if (!blockedDeploy) return;

  const summary = summarizeDeploy(blockedDeploy);
  logger.error?.(`[netlify] account credit preflight blocked deploy trigger: ${summary}`);
  throw new Error(
    "Netlify account credit usage exceeded. Resolve Netlify billing/credits before retrying deploy."
  );
}

export function writeDeployUrl(url, outputPath = process.env.GITHUB_OUTPUT, appendFile = appendFileSync) {
  if (!url || !outputPath) return;
  appendFile(outputPath, `deploy-url=${url}\n`);
}

export async function waitForNetlifyDeploy({
  config,
  fetchImpl = fetch,
  sleep: sleepImpl = sleep,
  writeOutput = writeDeployUrl,
  logger = console,
  now = Date.now,
}) {
  const start = now();
  const targetShortSha = config.targetSha.slice(0, 7);

  while (now() - start < config.timeoutMs) {
    const deploys = await listDeploys({ config, fetchImpl });
    const latest = deploys.slice(0, 5).map(summarizeDeploy);
    logger.log(`[netlify] latest deploys:\n${latest.map((item) => `- ${item}`).join("\n")}`);

    const deploy = findMatchingDeploy(deploys, config);

    if (!deploy) {
      logger.log(`[netlify] waiting for deploy for ${config.targetBranch ?? "unknown-branch"}@${targetShortSha}`);
      await sleepImpl(config.intervalMs);
      continue;
    }

    logger.log(`[netlify] matched deploy: ${summarizeDeploy(deploy)}`);

    if (deploy.state === "ready") {
      writeOutput(deployUrl(deploy));
      logger.log("[netlify] deploy is ready");
      return deploy;
    }

    if (FAILED_STATES.has(deploy.state)) {
      const details = deployDetails(deploy);
      throw new Error(
        `Netlify deploy ${deploy.id} finished with state=${deploy.state}${details ? `: ${details}` : ""}`
      );
    }

    await sleepImpl(config.intervalMs);
  }

  throw new Error(`Timed out waiting for Netlify deploy for ${config.targetBranch ?? "unknown-branch"}@${targetShortSha}`);
}

export async function main({ env = process.env, fetchImpl = fetch, logger = console } = {}) {
  const config = readConfigFromEnv(env);
  if (config.triggerBuild) {
    if (config.creditBlockPreflight) {
      await assertNetlifyCreditsAvailable({ config, fetchImpl, logger });
    }
    const build = await triggerNetlifyBuild({ config, fetchImpl, logger });
    config.targetDeployId = build.deploy_id || config.targetDeployId;
  }
  return waitForNetlifyDeploy({ config, fetchImpl, logger });
}

function isCliInvocation() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isCliInvocation()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
