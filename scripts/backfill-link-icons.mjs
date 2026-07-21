#!/usr/bin/env node
/**
 * 批量回填 nav_links.icon 为同源 favicon 代理 URL。
 *
 * 策略：
 *   - 仅处理 approved 行
 *   - 已是 http(s) 或 /api/favicon? 的跳过
 *   - emoji / 空 → `/api/favicon?domain=<host>&v=2`
 *   - 默认 dry-run；--write 才落库
 *   - 默认目标：.env.local 的 SUPABASE（通常 nav-dev）；生产必须显式 --prod + 二次确认 env
 *
 * 用法：
 *   node scripts/backfill-link-icons.mjs
 *   node scripts/backfill-link-icons.mjs --write
 *   node scripts/backfill-link-icons.mjs --write --limit 50
 *   node scripts/backfill-link-icons.mjs --write --prod
 */

import { createClient } from "@supabase/supabase-js";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { loadProjectEnv } from "./lib/load-project-env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

loadProjectEnv(projectRoot);

const args = process.argv.slice(2);
const write = args.includes("--write");
const prod = args.includes("--prod");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : null;

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isPreferredIcon(icon) {
  if (typeof icon !== "string") return false;
  const value = icon.trim();
  if (!value) return false;
  if (/^https?:\/\//i.test(value)) return true;
  return value.startsWith("/api/favicon?");
}

function buildIconUrl(domain) {
  return `/api/favicon?domain=${encodeURIComponent(domain)}&v=2`;
}

const url = prod
  ? process.env.NEXT_PUBLIC_SUPABASE_URL
  : process.env.NEXT_PUBLIC_SUPABASE_URL_DEV || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = prod
  ? process.env.SUPABASE_SERVICE_ROLE_KEY_PROD || process.env.SUPABASE_SERVICE_ROLE_KEY
  : process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY_PROD;

if (!url || !serviceKey) {
  console.error("缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (prod && !process.env.SUPABASE_SERVICE_ROLE_KEY_PROD && !args.includes("--i-know-this-is-prod")) {
  console.error(
    "生产回填需要 SUPABASE_SERVICE_ROLE_KEY_PROD，或显式加 --i-know-this-is-prod（仍须 --prod --write）"
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase
  .from("nav_links")
  .select("id,title,url,icon,approved")
  .eq("approved", true)
  .order("created_at", { ascending: false });

if (error) {
  console.error("查询失败:", error.message);
  process.exit(1);
}

const rows = data ?? [];
const candidates = [];

for (const row of rows) {
  if (isPreferredIcon(row.icon)) continue;
  const domain = extractDomain(row.url);
  if (!domain) {
    candidates.push({ row, skip: true, reason: "bad-url" });
    continue;
  }
  candidates.push({
    row,
    skip: false,
    nextIcon: buildIconUrl(domain),
    domain,
  });
}

const actionable = candidates.filter((c) => !c.skip);
const slice =
  typeof limit === "number" && Number.isFinite(limit) && limit > 0
    ? actionable.slice(0, limit)
    : actionable;

const alreadyPreferred = rows.length - candidates.length;
console.log(
  JSON.stringify(
    {
      mode: write ? "write" : "dry-run",
      target: prod ? "prod-key" : "default-service-role",
      supabaseHost: (() => {
        try {
          return new URL(url).host;
        } catch {
          return "invalid-url";
        }
      })(),
      approved: rows.length,
      alreadyPreferred,
      needBackfill: actionable.length,
      thisRun: slice.length,
      skippedBadUrl: candidates.filter((c) => c.skip).length,
    },
    null,
    2
  )
);

if (!write) {
  console.log("示例（最多 8 条）:");
  for (const item of slice.slice(0, 8)) {
    console.log(`  ${item.row.title}  ${item.row.icon ?? "(empty)"}  →  ${item.nextIcon}`);
  }
  console.log("\n加 --write 才会更新数据库。");
  process.exit(0);
}

let ok = 0;
let fail = 0;
for (const item of slice) {
  const { error: upErr } = await supabase
    .from("nav_links")
    .update({ icon: item.nextIcon })
    .eq("id", item.row.id);
  if (upErr) {
    fail += 1;
    console.error(`FAIL ${item.row.id} ${item.row.title}: ${upErr.message}`);
  } else {
    ok += 1;
  }
}

console.log(JSON.stringify({ updated: ok, failed: fail }, null, 2));
process.exit(fail > 0 ? 1 : 0);
