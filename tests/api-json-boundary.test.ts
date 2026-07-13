import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  checkRateLimit: vi.fn(),
  recordAttempt: vi.fn(),
  checkClickRateLimit: vi.fn(),
  recordClick: vi.fn(),
  incrementClickCount: vi.fn(),
  createServiceRoleClient: vi.fn(),
  getClientIp: vi.fn(),
  addUserFavorites: vi.fn(),
  findExistingLinkByUrl: vi.fn(),
  submitLink: vi.fn(),
  findApprovedLinkByUrl: vi.fn(),
  checkReviewRateLimit: vi.fn(),
  hasUserReviewed: vi.fn(),
  createReview: vi.fn(),
  recordReviewAttempt: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils")>("@/lib/utils");
  return {
    ...actual,
    getClientIp: mocks.getClientIp,
  };
});

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  recordAttempt: mocks.recordAttempt,
  checkClickRateLimit: mocks.checkClickRateLimit,
  recordClick: mocks.recordClick,
  incrementClickCount: mocks.incrementClickCount,
}));

vi.mock("@/lib/repositories", async () => {
  const actual = await vi.importActual<typeof import("@/lib/repositories")>(
    "@/lib/repositories"
  );
  return {
    ...actual,
    addUserFavorites: mocks.addUserFavorites,
    findExistingLinkByUrl: mocks.findExistingLinkByUrl,
    submitLink: mocks.submitLink,
    findApprovedLinkByUrl: mocks.findApprovedLinkByUrl,
    checkReviewRateLimit: mocks.checkReviewRateLimit,
    hasUserReviewed: mocks.hasUserReviewed,
    createReview: mocks.createReview,
    recordReviewAttempt: mocks.recordReviewAttempt,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: mocks.loggerError,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

function malformedJsonRequest(url: string) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  }) as NextRequest;
}

async function importFresh<T>(path: string): Promise<T> {
  vi.resetModules();
  return import(path) as Promise<T>;
}

describe("API malformed JSON boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
    mocks.getClientIp.mockReturnValue("127.0.0.1");
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, count: 0 });
    mocks.checkClickRateLimit.mockResolvedValue({ allowed: true });
    mocks.checkReviewRateLimit.mockResolvedValue(true);
    mocks.findApprovedLinkByUrl.mockResolvedValue({ id: "link-1" });
  });

  it("returns 400 for malformed favorites JSON", async () => {
    const { POST } = await importFresh<typeof import("@/app/api/favorites/route")>(
      "@/app/api/favorites/route"
    );

    const response = await POST(malformedJsonRequest("http://localhost/api/favorites"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/json/i);
    expect(mocks.addUserFavorites).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed submit JSON", async () => {
    const { POST } = await importFresh<typeof import("@/app/api/submit/route")>(
      "@/app/api/submit/route"
    );

    const response = await POST(malformedJsonRequest("http://localhost/api/submit"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/json/i);
    expect(mocks.findExistingLinkByUrl).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed click JSON", async () => {
    const { POST } = await importFresh<typeof import("@/app/api/click/route")>(
      "@/app/api/click/route"
    );

    const response = await POST(malformedJsonRequest("http://localhost/api/click"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/json/i);
    expect(mocks.findApprovedLinkByUrl).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed review JSON", async () => {
    const { POST } = await importFresh<typeof import("@/app/api/reviews/route")>(
      "@/app/api/reviews/route"
    );

    const response = await POST(malformedJsonRequest("http://localhost/api/reviews"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/json/i);
    expect(mocks.hasUserReviewed).not.toHaveBeenCalled();
  });
});

