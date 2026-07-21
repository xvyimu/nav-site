import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  listOpen: vi.fn(),
  resolve: vi.fn(),
  importReport: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/repositories/link-health", () => ({
  listOpenLinkHealthFindings: mocks.listOpen,
  resolveLinkHealthFinding: mocks.resolve,
  replaceOrUpsertFindingsFromReport: mocks.importReport,
}));

import { GET, POST } from "@/app/api/admin/link-health/route";

const FINDING_ID = "550e8400-e29b-41d4-a716-446655440000";
const LINK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function adminSession() {
  mocks.auth.mockResolvedValue({ user: { id: "admin", role: "admin" } });
}

function writeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/admin/link-health", {
    method: "POST",
    headers: {
      origin: "http://localhost",
      host: "localhost",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("GET /api/admin/link-health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminSession();
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/admin/link-health"));
    expect(response.status).toBe(401);
    expect(mocks.listOpen).not.toHaveBeenCalled();
  });

  it("returns 401 when non-admin", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "u", role: "user" } });
    const response = await GET(new Request("http://localhost/api/admin/link-health"));
    expect(response.status).toBe(401);
    expect(mocks.listOpen).not.toHaveBeenCalled();
  });

  it("returns empty findings for admin", async () => {
    mocks.listOpen.mockResolvedValue({ findings: [] });
    const response = await GET(new Request("http://localhost/api/admin/link-health"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      findings: [],
      meta: { openCount: 0 },
    });
  });

  it("returns unavailable meta when table is missing (no 500)", async () => {
    mocks.listOpen.mockResolvedValue({
      findings: [],
      unavailable: true,
      detail: "relation does not exist",
    });
    const response = await GET(new Request("http://localhost/api/admin/link-health"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      findings: [],
      meta: {
        openCount: 0,
        unavailable: true,
        detail: "relation does not exist",
      },
    });
  });

  it("returns open findings with openCount", async () => {
    const finding = {
      id: FINDING_ID,
      link_id: LINK_ID,
      title: "Broken",
      url: "https://example.com/gone",
      http_status: "404",
      detail: "HTTP 404",
      kind: "broken" as const,
      checked_at: "2026-07-21T00:00:00.000Z",
      resolved_at: null,
      run_id: "2026-07-21",
    };
    mocks.listOpen.mockResolvedValue({ findings: [finding] });
    const response = await GET(new Request("http://localhost/api/admin/link-health"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      findings: [finding],
      meta: { openCount: 1 },
    });
  });
});

describe("POST /api/admin/link-health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminSession();
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.auth.mockResolvedValue(null);
    const response = await POST(
      writeRequest({ action: "resolve", id: FINDING_ID }),
      { params: Promise.resolve({}) }
    );
    expect(response.status).toBe(401);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("rejects invalid resolve id", async () => {
    const response = await POST(
      writeRequest({ action: "resolve", id: "not-a-uuid" }),
      { params: Promise.resolve({}) }
    );
    expect(response.status).toBe(400);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("resolves a finding", async () => {
    mocks.resolve.mockResolvedValue({ ok: true });
    const response = await POST(
      writeRequest({ action: "resolve", id: FINDING_ID }),
      { params: Promise.resolve({}) }
    );
    expect(mocks.resolve).toHaveBeenCalledWith(FINDING_ID);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("surfaces resolve errors as 400", async () => {
    mocks.resolve.mockResolvedValue({ error: "记录不存在或已处理" });
    const response = await POST(
      writeRequest({ action: "resolve", id: FINDING_ID }),
      { params: Promise.resolve({}) }
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "记录不存在或已处理",
    });
  });

  it("imports a report", async () => {
    mocks.importReport.mockResolvedValue({ upserted: 2 });
    const report = {
      generatedAt: "2026-07-21T12:00:00.000Z",
      total: 10,
      ok: 8,
      broken: [
        {
          id: LINK_ID,
          title: "A",
          url: "https://a.example",
          status: "404",
          error: "HTTP 404",
        },
      ],
      redirects: [
        {
          id: null,
          title: "B",
          url: "https://b.example",
          status: 301,
          location: "https://b2.example",
        },
      ],
    };
    const response = await POST(
      writeRequest({ action: "import", report }),
      { params: Promise.resolve({}) }
    );
    expect(mocks.importReport).toHaveBeenCalledWith(report, null);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      upserted: 2,
    });
  });

  it("rejects import without report", async () => {
    const response = await POST(
      writeRequest({ action: "import" }),
      { params: Promise.resolve({}) }
    );
    expect(response.status).toBe(400);
    expect(mocks.importReport).not.toHaveBeenCalled();
  });
});
