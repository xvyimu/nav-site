import { describe, expect, it } from "vitest";
import {
  canonicalizeUrl,
  fromDevtoArticle,
  normalizePageCandidate,
  pageSha256,
  planIngest,
  stripHtml,
} from "../scripts/resource-ingest/lib.mjs";

type PageCandidate = {
  title: string;
  url: string;
  domain: string;
  summary: string;
  category: string;
  tags: string[];
  sha256: string;
  content_md?: string;
};

describe("resource-ingest lib", () => {
  it("strips html and tracking params", () => {
    expect(stripHtml("<p>Hello&amp;world</p>")).toBe("Hello&world");
    expect(
      canonicalizeUrl("https://dev.to/foo/bar?utm_source=x&ref=1#hash")
    ).toBe("https://dev.to/foo/bar");
  });

  it("normalizes a page candidate with stable sha256", () => {
    const a = normalizePageCandidate({
      title: "  Hello RAG  ",
      url: "https://dev.to/u/hello-rag?utm_campaign=1",
      description: "about retrieval",
      tag_list: ["ai", "python"],
    }) as PageCandidate | null;
    expect(a).not.toBeNull();
    if (!a) return;
    expect(a.domain).toBe("dev.to");
    expect(a.category).toBe("Other");
    expect(a.url).toBe("https://dev.to/u/hello-rag");
    expect(a.sha256).toBe(pageSha256("https://dev.to/u/hello-rag"));
    expect(a.sha256).toHaveLength(64);
  });

  it("maps dev.to articles and plans dedupe", () => {
    const rows = [
      fromDevtoArticle({
        title: "A",
        url: "https://dev.to/a/one",
        description: "d",
        tag_list: ["ai"],
      }),
      fromDevtoArticle({
        title: "A dup",
        url: "https://dev.to/a/one",
        description: "d",
        tag_list: ["ai"],
      }),
      fromDevtoArticle({
        title: "B",
        url: "https://dev.to/b/two",
        description: "d",
        tag_list: ["react"],
      }),
    ].filter((row): row is PageCandidate => row != null);

    const plan = planIngest(rows, {
      urls: new Set(["https://dev.to/b/two"]),
      shas: new Set(),
    }) as {
      toInsert: PageCandidate[];
      skipped: Array<{ reason: string }>;
    };

    expect(plan.toInsert).toHaveLength(1);
    expect(plan.toInsert[0].title).toBe("A");
    expect(plan.skipped.map((s) => s.reason).sort()).toEqual([
      "url_exists",
      "url_exists",
    ]);
  });
});
