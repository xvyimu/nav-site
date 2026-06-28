import { spawnSync } from "node:child_process";
import fs from "node:fs";

function loadEnv(path) {
  if (!fs.existsSync(path)) return;

  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    process.env[match[1]] ??= match[2].replace(/^['"]|['"]$/g, "");
  }
}

loadEnv(".env.local");
loadEnv(".env");

const dbUrl = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("Missing DATABASE_URL or SUPABASE_DB_URL.");
  console.error("Refusing to run a database write without an explicit Postgres connection string.");
  process.exit(2);
}

const result = spawnSync(
  "supabase",
  ["db", "query", "--db-url", dbUrl, "--file", "scripts/migration-reviews.sql"],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
  }
);

process.exit(result.status ?? 1);
