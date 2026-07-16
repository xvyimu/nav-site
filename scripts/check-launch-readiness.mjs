import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { runProductionProbe } from "./probe-production.mjs";

const execFile = promisify(execFileCallback);
const DEFAULT_BASE_URL = "https://yuanjia1314.ccwu.cc";
const DEFAULT_ALLOWED_DIRTY_PATHS = [".planning/"];

function readArgValue(args, name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);

  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function parseBooleanArg(args, name) {
  return args.includes(name);
}

export function readConfigFromEnv(env = process.env, args = process.argv.slice(2)) {
  return {
    baseUrl: readArgValue(args, "--base-url") || env.PRODUCTION_BASE_URL || DEFAULT_BASE_URL,
    expectedCommit: readArgValue(args, "--expect-commit") || env.PRODUCTION_EXPECT_COMMIT || "",
    json: parseBooleanArg(args, "--json"),
    skipNetwork: parseBooleanArg(args, "--skip-network"),
    allowedDirtyPaths: (
      readArgValue(args, "--allow-dirty") ||
      env.LAUNCH_READINESS_ALLOW_DIRTY ||
      DEFAULT_ALLOWED_DIRTY_PATHS.join(",")
    )
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

export function parseBranchStatus(line = "") {
  const aheadMatch = line.match(/\bahead (\d+)/);
  const behindMatch = line.match(/\bbehind (\d+)/);

  return {
    branch: line.replace(/^##\s*/, "").split("...")[0] || "unknown",
    ahead: aheadMatch ? Number(aheadMatch[1]) : 0,
    behind: behindMatch ? Number(behindMatch[1]) : 0,
  };
}

export function parseGitStatus(output, allowedDirtyPaths = DEFAULT_ALLOWED_DIRTY_PATHS) {
  const lines = output.split(/\r?\n/).filter(Boolean);
  const branch = parseBranchStatus(lines.find((line) => line.startsWith("## ")) || "");
  const dirty = lines
    .filter((line) => !line.startsWith("## "))
    .map((line) => line.slice(3).trim())
    .filter((path) => !allowedDirtyPaths.some((allowedPath) => path === allowedPath || path.startsWith(allowedPath)));

  return {
    ...branch,
    dirty,
  };
}

export function evaluateReadiness({
  git,
  currentProductionResults = [],
  latestProductionResults = [],
  networkSkipped = false,
}) {
  const checks = [];

  checks.push({
    name: "git-clean",
    ok: git.dirty.length === 0,
    detail: git.dirty.length === 0 ? "working tree clean" : `dirty paths: ${git.dirty.join(", ")}`,
  });

  checks.push({
    name: "git-pushed",
    ok: git.ahead === 0 && git.behind === 0,
    detail:
      git.ahead === 0 && git.behind === 0
        ? "local branch matches upstream"
        : `ahead=${git.ahead}, behind=${git.behind}`,
  });

  if (networkSkipped) {
    checks.push({
      name: "production-smoke",
      ok: false,
      detail: "network checks skipped",
    });
    checks.push({
      name: "latest-deployed",
      ok: false,
      detail: "network checks skipped",
    });
  } else {
    const currentFailures = currentProductionResults.filter((result) => !result.ok);
    checks.push({
      name: "production-smoke",
      ok: currentFailures.length === 0,
      detail:
        currentFailures.length === 0
          ? "current production smoke passed"
          : currentFailures.map((result) => `${result.name}: ${result.detail}`).join("; "),
    });

    const latestFailures = latestProductionResults.filter((result) => !result.ok);
    checks.push({
      name: "latest-deployed",
      ok: latestFailures.length === 0,
      detail:
        latestFailures.length === 0
          ? "expected commit is deployed"
          : latestFailures.map((result) => `${result.name}: ${result.detail}`).join("; "),
    });
  }

  return {
    ok: checks.every((check) => check.ok),
    checks,
  };
}

async function runGit(args, execFileImpl) {
  const { stdout } = await execFileImpl("git", args, { encoding: "utf8" });
  return stdout.trim();
}

export async function collectLaunchReadiness({
  config = readConfigFromEnv(),
  execFileImpl = execFile,
  fetchImpl = fetch,
} = {}) {
  const head = config.expectedCommit || (await runGit(["rev-parse", "HEAD"], execFileImpl));
  const gitStatus = parseGitStatus(
    await runGit(["status", "--branch", "--short"], execFileImpl),
    config.allowedDirtyPaths
  );

  let currentProductionResults = [];
  let latestProductionResults = [];

  if (!config.skipNetwork) {
    currentProductionResults = await runProductionProbe({
      config: {
        baseUrl: config.baseUrl,
        timeoutMs: 45_000,
        expectEmbeddingSkipped: false,
        expectedCommit: "",
        retries: 1,
        retryDelayMs: 750,
      },
      fetchImpl,
    });

    latestProductionResults = await runProductionProbe({
      config: {
        baseUrl: config.baseUrl,
        timeoutMs: 45_000,
        expectEmbeddingSkipped: true,
        expectedCommit: head,
        retries: 1,
        retryDelayMs: 750,
      },
      fetchImpl,
    });
  }

  const readiness = evaluateReadiness({
    git: gitStatus,
    currentProductionResults,
    latestProductionResults,
    networkSkipped: config.skipNetwork,
  });

  return {
    baseUrl: config.baseUrl,
    expectedCommit: head,
    git: gitStatus,
    ...readiness,
  };
}

export function formatReadinessReport(report) {
  const lines = [
    `Launch readiness for ${report.baseUrl}`,
    `Expected commit: ${report.expectedCommit}`,
    `Git: branch=${report.git.branch}, ahead=${report.git.ahead}, behind=${report.git.behind}`,
    "",
  ];

  for (const check of report.checks) {
    lines.push(`[${check.ok ? "PASS" : "FAIL"}] ${check.name}: ${check.detail}`);
  }

  return lines.join("\n");
}

export async function main({
  env = process.env,
  args = process.argv.slice(2),
  execFileImpl = execFile,
  fetchImpl = fetch,
  logger = console,
} = {}) {
  const config = readConfigFromEnv(env, args);
  const report = await collectLaunchReadiness({ config, execFileImpl, fetchImpl });

  if (config.json) {
    logger.log(JSON.stringify(report, null, 2));
  } else {
    logger.log(formatReadinessReport(report));
  }

  if (!report.ok) {
    process.exitCode = 1;
  }

  return report;
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
