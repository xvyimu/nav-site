import { appendFileSync } from "node:fs";

const token = process.env.NETLIFY_AUTH_TOKEN;
const siteId = process.env.NETLIFY_SITE_ID;
const targetSha = process.env.GITHUB_SHA?.toLowerCase();
const targetBranch = process.env.GITHUB_REF_NAME || process.env.NETLIFY_DEPLOY_BRANCH;
const timeoutMs = Number(process.env.NETLIFY_DEPLOY_POLL_TIMEOUT_MS ?? 8 * 60 * 1000);
const intervalMs = Number(process.env.NETLIFY_DEPLOY_POLL_INTERVAL_MS ?? 10 * 1000);

if (!token) {
  throw new Error("NETLIFY_AUTH_TOKEN is not set");
}

if (!siteId) {
  throw new Error("NETLIFY_SITE_ID is not set");
}

if (!targetSha) {
  throw new Error("GITHUB_SHA is not set");
}

const start = Date.now();
const targetShortSha = targetSha.slice(0, 7);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function candidateValues(deploy) {
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

function matchesCommit(deploy) {
  return candidateValues(deploy).some((value) => {
    if (value === targetSha) {
      return true;
    }

    return value.length >= 7 && (targetSha.startsWith(value) || value.startsWith(targetShortSha));
  });
}

function matchesBranch(deploy) {
  if (!targetBranch || !deploy.branch) {
    return true;
  }

  return deploy.branch === targetBranch;
}

function deployUrl(deploy) {
  return deploy.deploy_ssl_url || deploy.ssl_url || deploy.deploy_url || deploy.url || "";
}

function summarizeDeploy(deploy) {
  const commit = candidateValues(deploy)[0]?.slice(0, 7) || "unknown";
  const branch = deploy.branch || "unknown";
  const url = deployUrl(deploy) || "no-url";
  return `${deploy.id}: state=${deploy.state}, branch=${branch}, commit=${commit}, created_at=${deploy.created_at}, url=${url}`;
}

async function listDeploys() {
  const url = new URL(`https://api.netlify.com/api/v1/sites/${encodeURIComponent(siteId)}/deploys`);
  url.searchParams.set("per_page", "50");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "nav-site-ci",
    },
  });

  if (!response.ok) {
    throw new Error(`Netlify deploy lookup failed with HTTP ${response.status}`);
  }

  return response.json();
}

function writeDeployUrl(url) {
  if (!url || !process.env.GITHUB_OUTPUT) {
    return;
  }

  appendFileSync(process.env.GITHUB_OUTPUT, `deploy-url=${url}\n`);
}

while (Date.now() - start < timeoutMs) {
  const deploys = await listDeploys();
  const latest = deploys.slice(0, 5).map(summarizeDeploy);
  console.log(`[netlify] latest deploys:\n${latest.map((item) => `- ${item}`).join("\n")}`);

  const deploy = deploys.find((item) => matchesBranch(item) && matchesCommit(item));

  if (!deploy) {
    console.log(`[netlify] waiting for Git deploy for ${targetBranch ?? "unknown-branch"}@${targetShortSha}`);
    await sleep(intervalMs);
    continue;
  }

  console.log(`[netlify] matched deploy: ${summarizeDeploy(deploy)}`);

  if (deploy.state === "ready") {
    writeDeployUrl(deployUrl(deploy));
    console.log("[netlify] deploy is ready");
    process.exit(0);
  }

  if (["error", "failed", "rejected", "skipped", "canceled", "cancelled"].includes(deploy.state)) {
    throw new Error(`Netlify deploy ${deploy.id} finished with state=${deploy.state}`);
  }

  await sleep(intervalMs);
}

throw new Error(`Timed out waiting for Netlify Git deploy for ${targetBranch ?? "unknown-branch"}@${targetShortSha}`);
