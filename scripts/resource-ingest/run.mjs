#!/usr/bin/env node
/**
 * Resource Library ingest CLI
 *
 * Default is always dry-run (no writes). Use --write only with service role.
 *
 * Usage:
 *   node scripts/resource-ingest/run.mjs --source devto --tag ai --limit 20
 *   node scripts/resource-ingest/run.mjs --fixture scripts/resource-ingest/fixtures/sample-devto.json
 *   node scripts/resource-ingest/run.mjs --source devto --limit 10 --write
 *
 * Env (optional for dry-run DB dedupe):
 *   RESOURCE_LIBRARY_ANON_KEY / RESOURCE_LIBRARY_API_KEY — read existing urls
 * Env (required for --write):
 *   RESOURCE_LIBRARY_SERVICE_ROLE_KEY
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { fetchDevtoArticles } from "./devto.mjs";
import {
  RESOURCE_LIBRARY_URL,
  fromDevtoArticle,
  normalizePageCandidate,
  planIngest,
  stripMeta,
} from "./lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "../..");

function loadEnvLocal() {
  try {
    const envPath = join(projectRoot, ".env.local");
    const lines = readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* optional */
  }
}

loadEnvLocal();

function parseArgs(argv) {
  const args = {
    source: "devto",
    tag: "ai",
    limit: 20,
    page: 1,
    fixture: null,
    write: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--source") args.source = argv[++i];
    else if (a === "--tag") args.tag = argv[++i];
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a === "--page") args.page = Number(argv[++i]);
    else if (a === "--fixture") args.fixture = argv[++i];
    else if (a === "--write") args.write = true;
    else if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") args.help = true;
  }
  if (!Number.isFinite(args.limit) || args.limit < 1) args.limit = 20;
  if (args.limit > 100) args.limit = 100;
  return args;
}

function printHelp() {
  console.log(`Resource Library ingest (default: dry-run)

  node scripts/resource-ingest/run.mjs [options]

  --source devto     public API source (default)
  --tag <tag>        dev.to tag (default: ai)
  --limit <n>        1..100 (default: 20)
  --page <n>         API page (default: 1)
  --fixture <path>   offline JSON array of articles / page-like objects
  --write            actually insert (requires RESOURCE_LIBRARY_SERVICE_ROLE_KEY)
  --json             machine-readable summary on stdout
  --help
`);
}

async function loadCandidates(args) {
  if (args.fixture) {
    const path = resolve(process.cwd(), args.fixture);
    if (!existsSync(path)) throw new Error(`fixture not found: ${path}`);
    const data = JSON.parse(readFileSync(path, "utf-8"));
    if (!Array.isArray(data)) throw new Error("fixture must be a JSON array");
    return data.map((row) => {
      if (row.type_of === "article" || row.canonical_url || row.tag_list) {
        return fromDevtoArticle(row);
      }
      return normalizePageCandidate(row, { source: "fixture" });
    });
  }

  if (args.source === "devto") {
    const articles = await fetchDevtoArticles({
      tag: args.tag,
      perPage: args.limit,
      page: args.page,
    });
    return articles.map(fromDevtoArticle);
  }

  throw new Error(`unsupported source: ${args.source}`);
}

function getAnonKey() {
  return (
    process.env.RESOURCE_LIBRARY_ANON_KEY ||
    process.env.RESOURCE_LIBRARY_SUPABASE_ANON_KEY ||
    process.env.RESOURCE_LIBRARY_API_KEY ||
    process.env.NEXT_PUBLIC_RESOURCE_LIBRARY_API_KEY ||
    ""
  );
}

function getServiceKey() {
  return process.env.RESOURCE_LIBRARY_SERVICE_ROLE_KEY || "";
}

async function loadExisting(client) {
  const urls = new Set();
  const shas = new Set();
  // public view may not expose sha256 — url is enough for dry-run dedupe
  const pageSize = 500;
  let from = 0;
  for (;;) {
    const { data, error } = await client
      .from("public_pages")
      .select("url")
      .range(from, from + pageSize - 1);
    if (error) {
      // fallback raw pages if service role
      const alt = await client.from("pages").select("url,sha256").range(from, from + pageSize - 1);
      if (alt.error) throw new Error(error.message);
      for (const row of alt.data || []) {
        if (row.url) urls.add(row.url);
        if (row.sha256) shas.add(row.sha256);
      }
      if (!alt.data || alt.data.length < pageSize) break;
      from += pageSize;
      continue;
    }
    for (const row of data || []) {
      if (row.url) urls.add(row.url);
    }
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return { urls, shas };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const mode = args.write ? "write" : "dry-run";
  const candidates = (await loadCandidates(args)).filter(Boolean);

  let existing = { urls: new Set(), shas: new Set() };
  let dedupeSource = "none";

  if (args.write) {
    const serviceKey = getServiceKey();
    if (!serviceKey) {
      console.error("ERROR: --write requires RESOURCE_LIBRARY_SERVICE_ROLE_KEY");
      process.exit(2);
    }
    const client = createClient(RESOURCE_LIBRARY_URL, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    existing = await loadExisting(client);
    dedupeSource = "service_role:pages|public_pages";
    const plan = planIngest(candidates, existing);

    if (plan.toInsert.length === 0) {
      emitSummary(args, mode, candidates, plan, dedupeSource, { inserted: 0 });
      return;
    }

    const rows = plan.toInsert.map(stripMeta);
    const { error } = await client.from("pages").insert(rows);
    if (error) {
      console.error("insert failed:", error.message);
      process.exit(1);
    }
    emitSummary(args, mode, candidates, plan, dedupeSource, { inserted: rows.length });
    return;
  }

  // dry-run: optional anon dedupe
  const anon = getAnonKey();
  if (anon) {
    try {
      const client = createClient(RESOURCE_LIBRARY_URL, anon, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      existing = await loadExisting(client);
      dedupeSource = "anon:public_pages";
    } catch (e) {
      dedupeSource = `anon_failed:${e instanceof Error ? e.message : String(e)}`;
    }
  }

  const plan = planIngest(candidates, existing);
  emitSummary(args, mode, candidates, plan, dedupeSource, { inserted: 0 });
}

function emitSummary(args, mode, candidates, plan, dedupeSource, { inserted }) {
  const summary = {
    mode,
    source: args.fixture ? `fixture:${args.fixture}` : args.source,
    tag: args.tag,
    fetched: candidates.length,
    toInsert: plan.toInsert.length,
    skipped: plan.skipped.length,
    inserted,
    dedupeSource,
    sample: plan.toInsert.slice(0, 5).map((r) => ({
      title: r.title,
      url: r.url,
      domain: r.domain,
      category: r.category,
      sha256: r.sha256.slice(0, 12),
    })),
    skipReasons: plan.skipped.reduce((acc, s) => {
      acc[s.reason] = (acc[s.reason] || 0) + 1;
      return acc;
    }, {}),
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log("\n=== Resource Library ingest ===");
  console.log(`mode:         ${summary.mode}`);
  console.log(`source:       ${summary.source}`);
  if (!args.fixture) console.log(`tag/limit:    ${args.tag} / ${args.limit}`);
  console.log(`fetched:      ${summary.fetched}`);
  console.log(`toInsert:     ${summary.toInsert}`);
  console.log(`skipped:      ${summary.skipped}`);
  console.log(`inserted:     ${summary.inserted}`);
  console.log(`dedupe:       ${summary.dedupeSource}`);
  if (Object.keys(summary.skipReasons).length) {
    console.log("skipReasons: ", summary.skipReasons);
  }
  if (summary.sample.length) {
    console.log("\n── sample toInsert ──");
    for (const s of summary.sample) {
      console.log(`  [${s.category}] ${s.title}`);
      console.log(`    ${s.url}`);
    }
  }
  if (mode === "dry-run") {
    console.log("\nDry-run only. Re-run with --write to insert (service role required).");
  }
  console.log("");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
