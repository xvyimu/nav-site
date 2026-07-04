import { describe, it, expect } from "vitest";
import { getLinkType, relativeTime } from "@/lib/types";

describe("getLinkType", () => {
  it("treats removed model-ranking slugs as neutral", () => {
    expect(getLinkType("model-ranking")).toBe("neutral");
  });
  it("returns 'neutral' for unknown slugs", () => {
    expect(getLinkType("unknown")).toBe("neutral");
  });
  it("returns 'neutral' for null", () => {
    expect(getLinkType(null)).toBe("neutral");
  });
  it("returns 'neutral' for ai-api", () => {
    expect(getLinkType("ai-api")).toBe("neutral");
  });
  it("returns 'neutral' for free-relay", () => {
    expect(getLinkType("free-relay")).toBe("neutral");
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
    // 使用日历月份计算：当前日期减去 2 个月
    const d = new Date();
    d.setMonth(d.getMonth() - 2);
    expect(relativeTime(d.toISOString())).toBe("2个月前");
  });
  it("returns 'X年前' for >= 12 months", () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    expect(relativeTime(d.toISOString())).toBe("1年前");
  });
});
