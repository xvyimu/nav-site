import { describe, expect, it } from "vitest";
import { buildLinkHealthReport } from "../scripts/link-health-report-shape.mjs";

describe("buildLinkHealthReport", () => {
  it("shapes broken and redirects for --json", () => {
    const report = buildLinkHealthReport({
      total: 3,
      ok: 1,
      generatedAt: "2026-07-21T00:00:00.000Z",
      broken: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          title: "Gone",
          url: "https://gone.example",
          status: "FETCH_ERR",
          error: "abort",
        },
      ],
      redirects: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          title: "Moved",
          url: "https://old.example",
          status: 301,
          location: "https://new.example",
        },
      ],
    });

    expect(report).toEqual({
      generatedAt: "2026-07-21T00:00:00.000Z",
      total: 3,
      ok: 1,
      broken: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          title: "Gone",
          url: "https://gone.example",
          status: "FETCH_ERR",
          error: "abort",
        },
      ],
      redirects: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          title: "Moved",
          url: "https://old.example",
          status: 301,
          location: "https://new.example",
        },
      ],
    });
  });

  it("defaults empty arrays", () => {
    const report = buildLinkHealthReport({ total: 0, ok: 0 });
    expect(report.broken).toEqual([]);
    expect(report.redirects).toEqual([]);
    expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
