#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const SKIP_FILE_RE =
  /\.(png|jpe?g|gif|ico|svg|woff2?|eot|ttf|mp4|webm|zip|gz|lock)$/i;
const SKIP_FILES = new Set(["pnpm-lock.yaml", "package-lock.json", "yarn.lock"]);

const ALLOW_LINE_PATTERNS = [
  /process\.env\.(ADMIN_PASSWORD|AUTH_SECRET)/,
  /sk_live_placeholder/,
  /test[-_]?key/i,
  /test-service-role/,
  /example\.com/,
  /ghp_placeholder/,
  /postgres:\/\/localhost/,
  /\$\{\{\s*secrets\.[A-Z0-9_]+\s*\}\}/,
  /^[A-Z0-9_]+=$/,
];

const SECRET_PATTERNS = [
  {
    label: "private key",
    pattern: /-----BEGIN (RSA|DSA|EC|OPENSSH|PGP) PRIVATE KEY-----/,
  },
  {
    label: "GitHub token",
    pattern: /(ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9]{36}/,
  },
  {
    label: "Stripe live key",
    pattern: /(sk_live_|pk_live_)[A-Za-z0-9]{24,}/,
  },
  {
    label: "Slack token",
    pattern: /(xox[bpras])-[A-Za-z0-9-]{24,}/,
  },
  {
    label: "AWS access key",
    pattern: /AKIA[0-9A-Z]{16}/,
  },
  {
    label: "database URL with password",
    pattern: /(postgres:\/\/|mysql:\/\/|mongodb:\/\/)[A-Za-z0-9]+:[^@\s]{6,}@/,
  },
];

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function addedLinesFor(file) {
  const diff = git(["diff", "--cached", "--no-ext-diff", "--unified=0", "--", file]);
  return diff
    .split(/\r?\n/)
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));
}

function isAllowed(line) {
  return ALLOW_LINE_PATTERNS.some((pattern) => pattern.test(line));
}

const stagedFiles = git(["diff", "--cached", "--name-only", "--diff-filter=ACM"])
  .split(/\r?\n/)
  .map((file) => file.trim())
  .filter(Boolean)
  .filter((file) => !SKIP_FILES.has(file) && !SKIP_FILE_RE.test(file));

const violations = [];

for (const file of stagedFiles) {
  for (const [index, line] of addedLinesFor(file).entries()) {
    if (!line || isAllowed(line)) continue;

    const match = SECRET_PATTERNS.find(({ pattern }) => pattern.test(line));
    if (match) {
      violations.push({ file, line: index + 1, label: match.label, content: line });
    }
  }
}

if (violations.length > 0) {
  console.error("Commit blocked: possible secret exposure in staged changes.");
  for (const violation of violations) {
    console.error(`[${violation.label}] ${violation.file}:${violation.line}`);
    console.error(`  ${violation.content}`);
  }
  console.error("Remove the secret or replace it with an environment variable placeholder.");
  process.exit(1);
}
