#!/usr/bin/env node
/**
 * Backfill embeddings for Resource Library public.pages rows missing embedding.
 *
 * Uses local loopback embed server POST /embed-batch (document side, no query prefix)
 * and REST PATCH on pages via service role.
 *
 * Usage:
 *   node scripts/resource-ingest/backfill-page-embeddings.mjs           # dry-run
 *   node scripts/resource-ingest/backfill-page-embeddings.mjs --apply
 *   node scripts/resource-ingest/backfill-page-embeddings.mjs --apply --limit 50
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "../..");
const RESOURCE_LIBRARY_URL =
  process.env.RESOURCE_LIBRARY_URL || "https://ihnmfsfbfnctgkhxmghk.supabase.co";
const DEFAULT_EMBED = "http://127.0.0.1:8003";
const EXPECTED_DIM = 512;
const BATCH = 16;

function loadEnvLocal() {
  try {
    const lines = readFileSync(join(projectRoot, ".env.local"), "utf-8").split("\n");
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}

loadEnvLocal();

function parseArgs(argv) {
  const args = { apply: false, limit: 200, batch: BATCH };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--apply") args.apply = true;
    else if (argv[i] === "--limit") args.limit = Number(argv[++i]);
    else if (argv[i] === "--batch") args.batch = Number(argv[++i]);
  }
  if (!Number.isFinite(args.limit) || args.limit < 1) args.limit = 200;
  if (!Number.isFinite(args.batch) || args.batch < 1 || args.batch > 32) args.batch = BATCH;
  return args;
}

function embedText(row) {
  const title = (row.title || "").trim();
  const summary = (row.summary || "").trim();
  const category = (row.category || "").trim();
  const parts = [title];
  if (summary) parts.push(summary);
  if (category) parts.push(`[${category}]`);
  return parts.join(" ").slice(0, 1900);
}

async function embedBatch(baseUrl, texts, apiKey) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/embed-batch`, {
    method: "POST",
    headers,
    body: JSON.stringify({ texts }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`embed-batch HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.embeddings) || data.dim !== EXPECTED_DIM) {
    throw new Error(`invalid embed payload dim=${data.dim}`);
  }
  return data.embeddings;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const serviceKey = process.env.RESOURCE_LIBRARY_SERVICE_ROLE_KEY || "";
  if (!serviceKey) {
    console.error("RESOURCE_LIBRARY_SERVICE_ROLE_KEY required");
    process.exit(2);
  }
  const embedBase = process.env.EMBED_SERVER_URL || DEFAULT_EMBED;
  const embedKey = process.env.EMBED_SERVER_API_KEY || "";

  // health
  const health = await fetch(`${embedBase.replace(/\/$/, "")}/health`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!health.ok) throw new Error(`embed health HTTP ${health.status}`);
  const h = await health.json();
  if (h.status !== "ok" || h.dim !== EXPECTED_DIM) {
    throw new Error(`embed not ready: ${JSON.stringify(h)}`);
  }
  console.log(`[backfill-pages] embed ok model=${h.model} dim=${h.dim}`);
  console.log(`[backfill-pages] mode=${args.apply ? "apply" : "dry-run"} limit=${args.limit}`);

  const client = createClient(RESOURCE_LIBRARY_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: rows, error } = await client
    .from("pages")
    .select("id,title,summary,category")
    .is("embedding", null)
    .order("crawled_at", { ascending: false })
    .limit(args.limit);

  if (error) throw new Error(error.message);
  const missing = rows || [];
  console.log(`[backfill-pages] missing embedding: ${missing.length}`);
  if (missing.length === 0) return;

  let updated = 0;
  for (let i = 0; i < missing.length; i += args.batch) {
    const batch = missing.slice(i, i + args.batch);
    const texts = batch.map(embedText);
    console.log(`  batch ${Math.floor(i / args.batch) + 1}: ${batch.length} rows...`);
    if (!args.apply) {
      console.log(`    [dry-run] sample: ${texts[0]?.slice(0, 80)}`);
      updated += batch.length;
      continue;
    }
    const embeddings = await embedBatch(embedBase, texts, embedKey);
    for (let j = 0; j < batch.length; j++) {
      const emb = embeddings[j];
      if (!Array.isArray(emb) || emb.length !== EXPECTED_DIM) {
        console.error(`    skip ${batch[j].id}: bad dim`);
        continue;
      }
      // PostgREST accepts vector as string literal
      const vectorLiteral = `[${emb.join(",")}]`;
      const { error: upErr } = await client
        .from("pages")
        .update({ embedding: vectorLiteral })
        .eq("id", batch[j].id);
      if (upErr) {
        console.error(`    fail ${batch[j].id}: ${upErr.message}`);
      } else {
        updated += 1;
      }
    }
  }

  console.log(`[backfill-pages] done updated=${updated} apply=${args.apply}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
