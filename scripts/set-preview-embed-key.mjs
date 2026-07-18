#!/usr/bin/env node
/**
 * Push EMBED_SERVER_API_KEY from .env.local to Vercel Preview (no secret print).
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const m = {};
for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 0) continue;
  let v = t.slice(i + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  m[t.slice(0, i).trim()] = v;
}

const key = m.EMBED_SERVER_API_KEY;
if (!key) {
  console.error("EMBED_SERVER_API_KEY missing in .env.local — skip");
  process.exit(0);
}

console.log("EMBED_SERVER_API_KEY length=", key.length);
const r = spawnSync(
  "vercel",
  [
    "env",
    "add",
    "EMBED_SERVER_API_KEY",
    "preview",
    "--scope",
    "aijiai520",
    "--yes",
    "--force",
    "--sensitive",
    "--value",
    key,
  ],
  { encoding: "utf8", shell: true, cwd: root }
);
const out = `${r.stdout || ""}\n${r.stderr || ""}`;
for (const line of out.split(/\n/)) {
  if (/Overrode|Created|Error|error|✓|Saving/.test(line) && !key.includes(line)) {
    console.log(line);
  }
}
process.exit(r.status ?? 1);
