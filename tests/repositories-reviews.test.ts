import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MissingDatabaseMigrationError,
  checkReviewRateLimit,
  createReview,
  getReviewStats,
  getToolReviews,
  hasUserReviewed,
  recordReviewAttempt,
} from "@/lib/repositories/reviews";

const mocks = vi.hoisted(() => {
  class ReviewMockDB {
    private rows: Record<string, { data?: unknown; error?: { code?: string; message?: string } | null }> = {};
    private lastTable = "";
    calls: Record<string, unknown[][]> = {};

    setResponse(table: string, response: { data?: unknown; error?: { code?: string; message?: string } | null }) {
      this.rows[table] = response;
    }

    from(table: string) {
      this.lastTable = table;
      this.call("from", table);
      return this;
    }

    select(...args: unknown[]) { this.call("select", ...args); return this; }
    eq(...args: unknown[]) { this.call("eq", ...args); return this; }
    order(...args: unknown[]) { this.call("order", ...args); return this; }
    limit(...args: unknown[]) { this.call("limit", ...args); return this; }
    insert(...args: unknown[]) { this.call("insert", ...args); return this; }
    maybeSingle() { return Promise.resolve(this.response()); }
    single() { return Promise.resolve(this.response()); }

    private call(...args: unknown[]) {
      (this.calls[this.lastTable] ||= []).push(args);
    }

    private response() {
      const response = this.rows[this.lastTable] ?? {};
      return { data: response.data ?? null, error: response.error ?? null };
    }

    get data() { return this.response().data; }
    get error() { return this.response().error; }
  }

  return {
    mockDb: new ReviewMockDB(),
    checkRateLimit: vi.fn(),
    cleanupOldAttempts: vi.fn(),
  };
});

const { mockDb, checkRateLimit, cleanupOldAttempts } = mocks;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => mocks.mockDb),
  createServiceRoleClient: vi.fn(() => mocks.mockDb),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  cleanupOldAttempts: mocks.cleanupOldAttempts,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("repositories/reviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockDb.calls)) delete mockDb.calls[key];
    mockDb.setResponse("public_tool_reviews", { data: [], error: null });
    mockDb.setResponse("tool_review_stats", { data: null, error: null });
    mockDb.setResponse("tool_reviews", { data: null, error: null });
    mockDb.setResponse("review_rate_limits", { data: null, error: null });
    checkRateLimit.mockResolvedValue({ allowed: true });
  });

  it("reads public reviews without exposing ip", async () => {
    mockDb.setResponse("public_tool_reviews", {
      data: [{ id: "rev-1", link_id: "lnk-1", rating: 5, comment: "Nice", approved: true }],
      error: null,
    });

    const reviews = await getToolReviews("lnk-1");

    expect(reviews).toHaveLength(1);
    expect(JSON.stringify(reviews)).not.toContain("ip");
    expect(mockDb.calls.public_tool_reviews.some((call) => call[0] === "select")).toBe(true);
  });

  it("returns null review stats when aggregate row is absent", async () => {
    await expect(getReviewStats("lnk-1")).resolves.toBeNull();
  });

  it("throws MissingDatabaseMigrationError for missing private review table", async () => {
    mockDb.setResponse("tool_reviews", {
      data: null,
      error: { code: "PGRST205", message: "could not find the table" },
    });

    await expect(hasUserReviewed("lnk-1", "127.0.0.1")).rejects.toBeInstanceOf(MissingDatabaseMigrationError);
  });

  it("creates reviews through the private review table", async () => {
    mockDb.setResponse("tool_reviews", {
      data: { id: "rev-1", link_id: "lnk-1", rating: 4, comment: null, approved: true },
      error: null,
    });

    const review = await createReview("lnk-1", "127.0.0.1", 4, null);

    expect(review?.rating).toBe(4);
    expect(mockDb.calls.tool_reviews.some((call) => call[0] === "insert")).toBe(true);
  });

  it("checks and records review rate limits", async () => {
    await expect(checkReviewRateLimit("127.0.0.1")).resolves.toBe(true);
    await recordReviewAttempt("127.0.0.1", "lnk-1");

    expect(checkRateLimit).toHaveBeenCalledWith(
      "review_rate_limits",
      "127.0.0.1",
      15 * 60 * 1000,
      3,
      true,
      mockDb,
    );
    expect(cleanupOldAttempts).toHaveBeenCalledWith(mockDb, "review_rate_limits");
  });
});
