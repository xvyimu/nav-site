import { createClient } from "@supabase/supabase-js";
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY_PROD ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL and a Supabase key.");
  process.exit(2);
}

const supabase = createClient(url, key, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function checkTable(name, select) {
  const { error } = await supabase.from(name).select(select).limit(1);
  return {
    name,
    ok: !error,
    code: error?.code,
    message: error?.message,
  };
}

const checks = [
  await checkTable("tool_reviews", "id"),
  await checkTable("review_rate_limits", "id"),
  await checkTable("tool_review_stats", "link_id"),
];

let failed = false;
for (const check of checks) {
  if (check.ok) {
    console.log(`${check.name}: ok`);
  } else {
    failed = true;
    console.log(`${check.name}: FAIL ${check.code ?? "unknown"} ${check.message ?? ""}`.trim());
  }
}

if (failed) {
  console.error("Reviews migration is not fully applied.");
  process.exit(1);
}

console.log("Reviews migration verified.");
