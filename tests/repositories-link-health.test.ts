import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listOpenLinkHealthFindings,
  resolveLinkHealthFinding,
  replaceOrUpsertFindingsFromReport,
  isLinkHealthTableMissing,
} from "@/lib/repositories/link-health";

const FINDING_ID = "550e8400-e29b-41d4-a716-446655440000";
const LINK_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

type ChainResult = { data?: unknown; error?: { code?: string; message?: string } | null };

/** Minimal thenable query builder matching Supabase filter chains used by link-health. */
class LinkHealthMockDB {
  private responses: ChainResult[] = [];
  private responseIdx = 0;
  calls: unknown[][] = [];
  private pending: ChainResult | null = null;

  queue(result: ChainResult) {
    this.responses.push(result);
  }

  reset() {
    this.responses = [];
    this.responseIdx = 0;
    this.calls = [];
    this.pending = null;
  }

  from(table: string) {
    this.calls.push(["from", table]);
    return this;
  }

  select(...args: unknown[]) {
    this.calls.push(["select", ...args]);
    return this;
  }

  insert(...args: unknown[]) {
    this.calls.push(["insert", ...args]);
    return this;
  }

  update(...args: unknown[]) {
    this.calls.push(["update", ...args]);
    return this;
  }

  eq(...args: unknown[]) {
    this.calls.push(["eq", ...args]);
    return this;
  }

  is(...args: unknown[]) {
    this.calls.push(["is", ...args]);
    return this;
  }

  order(...args: unknown[]) {
    this.calls.push(["order", ...args]);
    return this;
  }

  private take(): ChainResult {
    if (this.responseIdx < this.responses.length) {
      return this.responses[this.responseIdx++];
    }
    return { data: null, error: null };
  }

  maybeSingle() {
    this.calls.push(["maybeSingle"]);
    const r = this.take();
    return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
  }

  // Terminal await on builder (list / insert without maybeSingle)
  then<TResult1 = ChainResult, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    const r = this.take();
    const value = { data: r.data ?? null, error: r.error ?? null };
    return Promise.resolve(value).then(onfulfilled, onrejected);
  }
}

const mockDb = new LinkHealthMockDB();

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: vi.fn(() => mockDb),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("isLinkHealthTableMissing", () => {
  it("detects 42P01 and PostgREST missing table codes", () => {
    expect(isLinkHealthTableMissing({ code: "42P01", message: "x" })).toBe(true);
    expect(isLinkHealthTableMissing({ code: "PGRST205", message: "x" })).toBe(true);
    expect(
      isLinkHealthTableMissing({
        message: 'relation "link_health_findings" does not exist',
      })
    ).toBe(true);
    expect(isLinkHealthTableMissing({ code: "42501", message: "permission" })).toBe(
      false
    );
  });
});

describe("listOpenLinkHealthFindings", () => {
  beforeEach(() => {
    mockDb.reset();
  });

  it("lists open findings with resolved_at IS NULL", async () => {
    const row = {
      id: FINDING_ID,
      link_id: LINK_A,
      title: "T",
      url: "https://t.example",
      http_status: "404",
      detail: null,
      kind: "broken",
      checked_at: "2026-07-21T00:00:00.000Z",
      resolved_at: null,
      run_id: "2026-07-21",
    };
    mockDb.queue({ data: [row], error: null });

    const result = await listOpenLinkHealthFindings();
    expect(result).toEqual({ findings: [row] });
    expect(mockDb.calls).toContainEqual(["from", "link_health_findings"]);
    expect(mockDb.calls).toContainEqual(["is", "resolved_at", null]);
  });

  it("returns unavailable when table is missing", async () => {
    mockDb.queue({
      data: null,
      error: { code: "42P01", message: "relation does not exist" },
    });

    const result = await listOpenLinkHealthFindings();
    expect(result).toEqual({
      findings: [],
      unavailable: true,
      detail: "relation does not exist",
    });
  });
});

describe("resolveLinkHealthFinding", () => {
  beforeEach(() => {
    mockDb.reset();
  });

  it("updates resolved_at for open id", async () => {
    mockDb.queue({ data: { id: FINDING_ID }, error: null });

    await expect(resolveLinkHealthFinding(FINDING_ID)).resolves.toEqual({
      ok: true,
    });

    expect(mockDb.calls).toContainEqual(["from", "link_health_findings"]);
    expect(mockDb.calls).toContainEqual(["eq", "id", FINDING_ID]);
    expect(mockDb.calls).toContainEqual(["is", "resolved_at", null]);
    const updateCall = mockDb.calls.find((c) => c[0] === "update");
    expect(updateCall).toBeTruthy();
    expect((updateCall?.[1] as { resolved_at: string }).resolved_at).toMatch(
      /^\d{4}-\d{2}-\d{2}/
    );
  });

  it("returns error when no open row matched", async () => {
    mockDb.queue({ data: null, error: null });
    await expect(resolveLinkHealthFinding(FINDING_ID)).resolves.toEqual({
      error: "记录不存在或已处理",
    });
  });
});

describe("replaceOrUpsertFindingsFromReport", () => {
  beforeEach(() => {
    mockDb.reset();
  });

  it("updates existing open finding for same link_id+kind", async () => {
    // find existing
    mockDb.queue({ data: { id: FINDING_ID }, error: null });
    // update
    mockDb.queue({ data: null, error: null });

    const report = {
      generatedAt: "2026-07-21T12:00:00.000Z",
      total: 1,
      ok: 0,
      broken: [
        {
          id: LINK_A,
          title: "A",
          url: "https://a.example",
          status: "500",
          error: "HTTP 500",
        },
      ],
      redirects: [],
    };

    await expect(replaceOrUpsertFindingsFromReport(report)).resolves.toEqual({
      upserted: 1,
    });

    expect(mockDb.calls).toContainEqual(["eq", "link_id", LINK_A]);
    expect(mockDb.calls).toContainEqual(["eq", "kind", "broken"]);
    expect(mockDb.calls).toContainEqual(["is", "resolved_at", null]);
    expect(mockDb.calls.some((c) => c[0] === "update")).toBe(true);
    expect(mockDb.calls.some((c) => c[0] === "insert")).toBe(false);
  });

  it("inserts when no open finding for link_id+kind", async () => {
    mockDb.queue({ data: null, error: null }); // find
    mockDb.queue({ data: null, error: null }); // insert

    const report = {
      generatedAt: "2026-07-21T12:00:00.000Z",
      total: 1,
      ok: 0,
      broken: [
        {
          id: LINK_A,
          title: "A",
          url: "https://a.example",
          status: "404",
        },
      ],
      redirects: [],
    };

    await expect(replaceOrUpsertFindingsFromReport(report)).resolves.toEqual({
      upserted: 1,
    });
    expect(mockDb.calls.some((c) => c[0] === "insert")).toBe(true);
  });

  it("inserts redirect without link_id without prior find", async () => {
    mockDb.queue({ data: null, error: null }); // insert only

    const report = {
      generatedAt: "2026-07-21T12:00:00.000Z",
      total: 1,
      ok: 0,
      broken: [],
      redirects: [
        {
          title: "R",
          url: "https://r.example",
          status: 301,
          location: "https://r2.example",
        },
      ],
    };

    await expect(replaceOrUpsertFindingsFromReport(report, "run-1")).resolves.toEqual(
      { upserted: 1 }
    );
    const insertCall = mockDb.calls.find((c) => c[0] === "insert");
    expect(insertCall?.[1]).toMatchObject({
      link_id: null,
      kind: "redirect",
      run_id: "run-1",
      http_status: "301",
      detail: "https://r2.example",
    });
  });

  it("returns error when table missing on find", async () => {
    mockDb.queue({
      data: null,
      error: { code: "PGRST205", message: "Could not find the table" },
    });

    const report = {
      generatedAt: "2026-07-21T12:00:00.000Z",
      total: 1,
      ok: 0,
      broken: [{ id: LINK_A, title: "A", url: "https://a.example", status: "404" }],
      redirects: [],
    };

    const result = await replaceOrUpsertFindingsFromReport(report);
    expect(result).toMatchObject({ error: expect.stringContaining("migration-link-health") });
  });
});
