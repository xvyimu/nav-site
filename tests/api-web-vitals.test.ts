import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkDistributedRateLimit: vi.fn(),
  captureMessage: vi.fn(),
  setMeasurement: vi.fn(),
}));

vi.mock("@/lib/rate-limit-distributed", () => ({
  checkDistributedRateLimit: mocks.checkDistributedRateLimit,
}));

vi.mock("@sentry/nextjs", () => ({
  captureMessage: mocks.captureMessage,
  setMeasurement: mocks.setMeasurement,
}));

const metric = {
  id: "metric-1",
  name: "LCP",
  value: 1200,
  delta: 10,
  rating: "good",
  navigationType: "navigate",
};

describe("POST /api/web-vitals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkDistributedRateLimit.mockResolvedValue({ allowed: true, backend: "memory" });
  });

  it("rejects requests without a same-origin browser Origin header", async () => {
    const { POST } = await import("@/app/api/web-vitals/route");
    const response = await POST(new Request("http://localhost/api/web-vitals", {
      method: "POST",
      headers: { "Content-Type": "application/json", Host: "localhost" },
      body: JSON.stringify(metric),
    }));

    expect(response.status).toBe(403);
    expect(mocks.captureMessage).not.toHaveBeenCalled();
  });

  it("returns 429 before sending an event when the distributed quota is exhausted", async () => {
    mocks.checkDistributedRateLimit.mockResolvedValue({ allowed: false, backend: "upstash" });
    const { POST } = await import("@/app/api/web-vitals/route");
    const response = await POST(new Request("http://localhost/api/web-vitals", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Host: "localhost",
        Origin: "http://localhost",
        "x-forwarded-for": "203.0.113.9",
      },
      body: JSON.stringify(metric),
    }));

    expect(response.status).toBe(429);
    expect(mocks.captureMessage).not.toHaveBeenCalled();
  });

  it("returns 429 when distributed limiter is unavailable under fail-closed", async () => {
    mocks.checkDistributedRateLimit.mockResolvedValue({ allowed: false, backend: "unavailable" });
    const { POST } = await import("@/app/api/web-vitals/route");
    const response = await POST(new Request("http://localhost/api/web-vitals", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Host: "localhost",
        Origin: "http://localhost",
        "x-forwarded-for": "203.0.113.10",
      },
      body: JSON.stringify(metric),
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(mocks.captureMessage).not.toHaveBeenCalled();
    expect(mocks.setMeasurement).not.toHaveBeenCalled();
  });
});
