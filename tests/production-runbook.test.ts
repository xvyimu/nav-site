import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readDoc(fileName: string) {
  return readFileSync(join(process.cwd(), "docs", fileName), "utf8");
}

function readScript(fileName: string) {
  return readFileSync(join(process.cwd(), "scripts", fileName), "utf8");
}

describe("production runbook", () => {
  it("keeps launch checklist linked to the production runbook", () => {
    const checklist = readDoc("LAUNCH-CHECKLIST.md");

    expect(checklist).toContain("[生产运行手册](./PRODUCTION-RUNBOOK.md)");
    expect(checklist).toContain("checks.resourceLibrarySearch.status");
  });

  it("documents the Vercel production and emergency Netlify contracts", () => {
    const runbook = readDoc("PRODUCTION-RUNBOOK.md");
    const checklist = readDoc("LAUNCH-CHECKLIST.md");

    expect(runbook).toContain("当前生产 = Vercel");
    expect(runbook).toContain("Netlify account credit");
    expect(runbook).toContain("resourceLibrarySearch");
    expect(runbook).toContain("resource_search_health");
    expect(runbook).toContain("不要在 handoff、日志、commit message、README 中写入任何 secret");
    expect(checklist).toContain("Vercel 主轨");
    expect(checklist).toContain("ALLOW_NETLIFY_MIRROR=1");
    expect(checklist).toContain("[Emergency] Netlify mirror");
    expect(checklist).toContain("https://yuanjia1314.ccwu.cc");
  });

  it("documents the Cloudflare 1024-d embedding cutover contract", () => {
    const runbook = readDoc("PRODUCTION-RUNBOOK.md");

    expect(runbook).toContain("EMBED_PROVIDER=cloudflare");
    expect(runbook).toContain("EMBED_SEMANTIC_RPC=search_links_semantic_v2");
    expect(runbook).toContain("batch_update_embeddings_v2");
    expect(runbook).toContain("--provider cloudflare");
    expect(runbook).toContain("--require-embedding");
  });
});

describe("S0 audit migration", () => {
  it("contains the 1024-d pgvector objects required by the Cloudflare cutover", () => {
    const migration = readScript("migration-audit-s0-constraints.sql");

    expect(migration).toContain("embedding_1024 vector(1024)");
    expect(migration).toContain("idx_nav_links_embedding_1024");
    expect(migration).toContain("search_links_semantic_v2");
    expect(migration).toContain("query_embedding vector(1024)");
    expect(migration).toContain("batch_update_embeddings_v2");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ");
    expect(migration).toContain("DROP FUNCTION IF EXISTS batch_update_embeddings(jsonb)");
    expect(migration).toContain("SET search_path = public, extensions");
    expect(migration).toContain("REVOKE EXECUTE ON FUNCTION batch_update_embeddings_v2(jsonb) FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION batch_update_embeddings_v2(jsonb) TO service_role");
    expect(migration).toContain("USING hnsw (embedding_1024 vector_cosine_ops)");
    expect(migration).not.toContain("USING ivfflat (embedding_1024 vector_cosine_ops)");
  });

  it("contains the filtered public tools RPC with explicit grants", () => {
    const migration = readScript("migration-audit-s0-constraints.sql");

    expect(migration).toContain("FUNCTION list_public_tools(");
    expect(migration).toContain("SECURITY INVOKER");
    expect(migration).toContain("COUNT(*) OVER() AS total_count");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION list_public_tools(TEXT, UUID[], TEXT, INTEGER) TO anon, authenticated, service_role"
    );
  });

  it("ships an explicit rollback script for all added objects", () => {
    const rollback = readScript("migration-audit-s0-constraints.rollback.sql");

    expect(rollback).toContain("DROP FUNCTION IF EXISTS list_public_tools");
    expect(rollback).toContain("DROP FUNCTION IF EXISTS consume_rate_limit");
    expect(rollback).toContain("DROP INDEX IF EXISTS idx_nav_links_embedding_1024");
    expect(rollback).toContain("BEGIN;");
    expect(rollback).toContain("COMMIT;");
  });
});
