import { describe, it, expect } from "vitest";
import { getLinkType, relativeTime } from "@/lib/types";

describe("getLinkType", () => {
  it("returns 'official' for big-tech", () => {
    expect(getLinkType("big-tech")).toBe("official");
  });
  it("returns 'relay' for free-relay", () => {
    expect(getLinkType("free-relay")).toBe("relay");
  });
  it("returns 'model' for model-ranking", () => {
    expect(getLinkType("model-ranking")).toBe("model");
  });
  it("returns 'neutral' for unknown slugs", () => {
    expect(getLinkType("unknown")).toBe("neutral");
  });
  it("returns 'neutral' for null", () => {
    expect(getLinkType(null)).toBe("neutral");
  });
});

describe("relativeTime", () => {
  it("returns empty string for null", () => {
    expect(relativeTime(null)).toBe("");
  });
  it("returns empty string for undefined", () => {
    expect(relativeTime(undefined)).toBe("");
  });
  it("returns '刚刚' for < 1 min", () => {
    const now = new Date().toISOString();
    expect(relativeTime(now)).toBe("刚刚");
  });
  it("returns 'X分钟前' for < 60 min", () => {
    const d = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(relativeTime(d)).toBe("5分钟前");
  });
  it("returns 'X小时前' for < 24 hours", () => {
    const d = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(d)).toBe("3小时前");
  });
  it("returns 'X天前' for < 30 days", () => {
    const d = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(d)).toBe("10天前");
  });
  it("returns 'X个月前' for >= 30 days", () => {
    const d = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(d)).toBe("2个月前");
  });
});