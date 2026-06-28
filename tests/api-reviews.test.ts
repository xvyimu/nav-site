import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const checkReviewRateLimit = vi.fn(async () => true);
const hasUserReviewed = vi.fn(async () => false);
const createReview = vi.fn();
const recordReviewAttempt = vi.fn(async () => undefined);

vi.mock("@/lib/repositories", async () => {
  const actual = await vi.importActual<typeof import("@/lib/repositories")>(
    "@/lib/repositories"
  );
  return {
    ...actual,
    checkReviewRateLimit,
    hasUserReviewed,
    createReview,
    recordReviewAttempt,
  };
});

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("/api/reviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 503 when review tables have not been migrated", async () => {
    const { POST } = await import("@/app/api/reviews/route");
    const { MissingDatabaseMigrationError } = await import("@/lib/repositories");
    createReview.mockRejectedValueOnce(new MissingDatabaseMigrationError("reviews"));

    const request = new Request("http://localhost/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          link_id: "550e8400-e29b-41d4-a716-446655440000",
          rating: 5,
          comment: "good",
        }),
      }) as NextRequest;
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toMatch(/migration/i);
    expect(recordReviewAttempt).not.toHaveBeenCalled();
  });
});
