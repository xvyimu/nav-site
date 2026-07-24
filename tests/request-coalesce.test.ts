import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __clearCoalesceInFlightForTests,
  __coalesceInFlightSizeForTests,
  coalesceInFlight,
} from "@/lib/request-coalesce";
import { getApprovedLinks } from "@/lib/repositories/links";
import { createStaticClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createStaticClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

type RowMap = Record<string, { data?: unknown; error?: { code?: string; message?: string } | null }>;

class DeferredMockDB {
  private rows: RowMap = {};
  private release!: () => void;
  private gate = new Promise<void>((resolve) => {
    this.release = resolve;
  });
  private _lastTable = "";
  private _calls: Record<string, { args: unknown[] }[]> = {};
  selectCount = 0;

  setResponse(table: string, r: { data?: unknown; error?: { code?: string; message?: string } | null }) {
    this.rows[table] = r;
  }

  open() {
    this.release();
  }

  from(table: string) {
    this._lastTable = table;
    (this._calls[table] ||= []).push({ args: ["from"] });
    return this;
  }
  select(...a: unknown[]) {
    this.selectCount += 1;
    this._call("select", ...a);
    return this;
  }
  eq(...a: unknown[]) {
    this._call("eq", ...a);
    return this;
  }
  order(...a: unknown[]) {
    this._call("order", ...a);
    return this;
  }
  range(...a: unknown[]) {
    this._call("range", ...a);
    return this;
  }
  abortSignal(...a: unknown[]) {
    this._call("abortSignal", ...a);
    return this;
  }
  in(...a: unknown[]) {
    this._call("in", ...a);
    return this;
  }
  maybeSingle() {
    return this.thenable();
  }
  single() {
    return this.thenable();
  }

  private _call(name: string, ...args: unknown[]) {
    (this._calls[this._lastTable] ||= []).push({ args: [name, ...args] });
  }

  private thenable() {
    return this.gate.then(() => ({
      data: this.rows[this._lastTable]?.data ?? null,
      error: this.rows[this._lastTable]?.error ?? null,
    }));
  }

  // Await chain without terminal → resolve after gate
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.thenable().then(onfulfilled, onrejected);
  }

  get data() {
    return this.rows[this._lastTable]?.data ?? null;
  }
  get error() {
    return this.rows[this._lastTable]?.error ?? null;
  }
}

const mockLinkRow = {
  id: "lnk-1",
  title: "ChatGPT",
  slug: "chatgpt",
  url: "https://chat.openai.com",
  description: "AI chat",
  icon: null,
  category_id: "cat-1",
  approved: true,
  paid: false,
  featured: true,
  click_count: 10,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  nav_categories: { name: "AI", slug: "ai" },
};

describe("coalesceInFlight", () => {
  beforeEach(() => {
    __clearCoalesceInFlightForTests();
  });

  afterEach(() => {
    __clearCoalesceInFlightForTests();
  });

  it("shares one factory across concurrent waiters with the same key", async () => {
    let runs = 0;
    let resolveFactory!: (value: string) => void;
    const factory = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          runs += 1;
          resolveFactory = resolve;
        })
    );

    const a = coalesceInFlight("k1", factory);
    const b = coalesceInFlight("k1", factory);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(__coalesceInFlightSizeForTests()).toBe(1);

    resolveFactory("ok");
    await expect(Promise.all([a, b])).resolves.toEqual(["ok", "ok"]);
    expect(runs).toBe(1);
    expect(__coalesceInFlightSizeForTests()).toBe(0);
  });

  it("does not share across different keys", async () => {
    const factoryA = vi.fn(async () => "a");
    const factoryB = vi.fn(async () => "b");
    await expect(
      Promise.all([coalesceInFlight("ka", factoryA), coalesceInFlight("kb", factoryB)])
    ).resolves.toEqual(["a", "b"]);
    expect(factoryA).toHaveBeenCalledTimes(1);
    expect(factoryB).toHaveBeenCalledTimes(1);
  });

  it("re-runs factory after previous in-flight settles (no result cache)", async () => {
    const factory = vi.fn(async () => "v");
    await coalesceInFlight("k", factory);
    await coalesceInFlight("k", factory);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("aborts only the waiter; shared factory keeps running for others", async () => {
    let resolveFactory!: (value: string) => void;
    const factory = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFactory = resolve;
        })
    );
    const ac = new AbortController();
    const aborted = coalesceInFlight("k", factory, ac.signal);
    const kept = coalesceInFlight("k", factory);
    ac.abort();
    await expect(aborted).rejects.toMatchObject({ name: "AbortError" });
    resolveFactory("done");
    await expect(kept).resolves.toBe("done");
    expect(factory).toHaveBeenCalledTimes(1);
  });
});

describe("getApprovedLinks · concurrent coalesce", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __clearCoalesceInFlightForTests();
  });

  afterEach(() => {
    __clearCoalesceInFlightForTests();
  });

  it("concurrent full-list calls with different AbortSignals share one select", async () => {
    const db = new DeferredMockDB();
    db.setResponse("nav_links", { data: [mockLinkRow], error: null });
    db.setResponse("nav_links_tags", { data: [], error: null });
    vi.mocked(createStaticClient).mockReturnValue(db as unknown as ReturnType<typeof createStaticClient>);

    const s1 = AbortSignal.timeout(30_000);
    const s2 = AbortSignal.timeout(30_000);
    const p1 = getApprovedLinks({ signal: s1 });
    const p2 = getApprovedLinks({ signal: s2 });

    // Allow microtasks so both join the same in-flight before DB opens
    await Promise.resolve();
    expect(db.selectCount).toBe(1);

    db.open();
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0].title).toBe("ChatGPT");
    expect(b[0].title).toBe("ChatGPT");
    // one links select (+ optional tags select); not doubled for two waiters
    expect(db.selectCount).toBeLessThanOrEqual(3);
    expect(createStaticClient).toHaveBeenCalledTimes(1);
  });

  it("different limit keys do not coalesce", async () => {
    const db = new DeferredMockDB();
    db.setResponse("nav_links", { data: [mockLinkRow], error: null });
    db.setResponse("nav_links_tags", { data: [], error: null });
    vi.mocked(createStaticClient).mockReturnValue(db as unknown as ReturnType<typeof createStaticClient>);

    const p1 = getApprovedLinks({ limit: 5 });
    const p2 = getApprovedLinks({ limit: 10 });
    await Promise.resolve();
    // two independent factories may each start a select
    expect(db.selectCount).toBe(2);
    db.open();
    await Promise.all([p1, p2]);
    expect(createStaticClient).toHaveBeenCalledTimes(2);
  });
});
