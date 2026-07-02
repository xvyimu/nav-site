import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getCategories, getApprovedLinks, getApprovedLinkBySlug, getAllApprovedLinkSlugs,
  getRelatedLinks, getApprovedLinksForApi, getToolReviews, getReviewStats,
  hasUserReviewed, createReview, checkReviewRateLimit, recordReviewAttempt,
  getAllLinksForAdmin, createLink, updateLink, deleteLink,
  getAllCategoriesForAdmin, createCategory, updateCategory, deleteCategory,
  getAllTagsForAdmin, createTag, updateTag, deleteTag,
  findExistingLinkByUrl, submitLink, findApprovedLinkByUrl,
  getUserFavorites, addUserFavorites, removeUserFavorite, clearUserFavorites,
} from "@/lib/repositories";

// ═══════════════════════════════════════════════════════════════
// Mock 策略
// ═══════════════════════════════════════════════════════════════
//
// 关键发现（排坑）：
//  1. React cache() 以首个参数引用做 key。直接调用 getCategories()
//     会导致所有测试命中同一缓存。解法：缓存函数接受 db 作为第一参数。
//  2. createClient / createServiceRoleClient 均为 async function，
//     需 mockReturnValue（非 mockResolvedValue）返回 MockDB 实例。
//  3. 函数内部多数是 `const supabase = await createClient()`，
//     所以 mock 的返回值直接就是 MockDB 即可。
//  4. MockDB 必须实现 `.upsert()` 和 `.lt()`（部分链路会调用）。

// ═══════════════════════════════════════════════════════════════
// MockDB
// ═══════════════════════════════════════════════════════════════

type RowMap = Record<string, { data?: unknown; error?: { code?: string; message?: string } }>;

class MockDB {
  private rows: RowMap = {};
  private _calls: Record<string, { table: string; args: unknown[] }[]> = {};

  setResponse(table: string, r: { data?: unknown; error?: { code?: string; message?: string } }) {
    this.rows[table] = r;
  }

  // Chainable methods all return `this` for fluent API
  from(table: string) {
    this._lastTable = table;
    (this._calls[table] ||= []).push({ table, args: ["from"] });
    return this;
  }
  select(_c?: string) { this._call("select", _c); return this; }
  eq(c: string, v: unknown) { this._call("eq", c, v); return this; }
  neq() { return this; }
  in_(c: string, v: unknown[]) { this._call("in", c, v); return this; }
  /** .in() is the real Supabase chain method name, while .in_() is the JS reserved-word alias */
  in(c: string, v: unknown[]) { return this.in_(c, v); }
  or_() { return this; }
  order() { return this; }
  limit() { return this; }
  range(...a: unknown[]) { this._call("range", ...a); return this; }
  lt() { return this; }
  gte() { return this; }
  like() { return this; }
  ilike() { return this; }
  is() { return this; }
  or() { return this; }
  match() { return this; }
  filter() { return this; }
  not() { return this; }
  contains() { return this; }
  textSearch() { return this; }
  foreignTable() { return this; }

  callsFor(table: string) {
    return this._calls[table] ?? [];
  }

  // Terminal async methods
  maybeSingle() { return Promise.resolve(this._resp()); }
  single() { return Promise.resolve(this._resp()); }
  insert(_r: unknown) { this._call("insert"); return this; }
  update(_r: unknown) { return this; }
  upsert(_r: unknown) { return this; }
  delete() { this._call("delete"); return this; }

  private _lastTable = "";

  private _call(name: string, ...args: unknown[]) {
    (this._calls[this._lastTable] ||= []).push({ table: this._lastTable, args: [name, ...args] });
  }

  private _resp() {
    return {
      data: this.rows[this._lastTable]?.data ?? null,
      error: this.rows[this._lastTable]?.error ?? null,
    };
  }

  /**
   * 让非终端链（无 .single()/.maybeSingle() 的链）也能解构出 { data, error }。
   * await chain 返回 MockDB 实例，解构调用 getter 委托给 _resp()。
   */
  get data() { return this._resp().data; }
  get error() { return this._resp().error; }
}

// ═══════════════════════════════════════════════════════════════
// Mock 客户端工厂
// ═══════════════════════════════════════════════════════════════

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createStaticClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

import {
  createClient,
  createStaticClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

/** 每个测试调用一次，三个工厂均返回此 db 实例 */
function freshMocks() {
  const db = new MockDB();
  vi.mocked(createClient).mockReturnValue(db);
  vi.mocked(createStaticClient).mockReturnValue(db);
  vi.mocked(createServiceRoleClient).mockReturnValue(db);
  return db;
}

// ═══════════════════════════════════════════════════════════════
// 测试数据
// ═══════════════════════════════════════════════════════════════

const mockCat = { id: "cat-1", name: "AI", slug: "ai", description: "AI tools", icon: "bot", sort_order: 1, created_at: "2026-01-01", parent_id: null };
const mockLinkRow = {
  id: "lnk-1", title: "ChatGPT", url: "https://chat.openai.com/", description: "AI chat",
  category_id: "cat-1", approved: true, paid: false, featured: true,
  created_at: "2026-01-01", updated_at: "2026-01-01", click_count: 10,
  nav_categories: { name: "AI", slug: "ai" },
};
const mockTagRow = { id: "tag-1", name: "Hot", slug: "hot", created_at: "2026-01-01" };
const mockReviewRow = { id: "rev-1", link_id: "lnk-1", user_ip: "1.1.1.1", rating: 5, comment: "Great", created_at: "2026-01-01" };
const mockStatsRow = { link_id: "lnk-1", avg_rating: 4.5, count: 10 };

// ═══════════════════════════════════════════════════════════════
// 分类
// ═══════════════════════════════════════════════════════════════

describe("repositories · 分类", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("getCategories 成功返回列表", async () => {
    const db = freshMocks();
    db.setResponse("nav_categories", { data: [mockCat], error: null });
    const result = await getCategories(db);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("AI");
  });

  it("getCategories 出错抛异常", async () => {
    const db = freshMocks();
    db.setResponse("nav_categories", { data: null, error: { code: "PGRST205", message: "no table" } });
    await expect(getCategories(db)).rejects.toThrow("Failed to fetch categories");
  });

  it("getAllCategoriesForAdmin", async () => {
    const db = freshMocks();
    db.setResponse("nav_categories", { data: [mockCat], error: null });
    expect(await getAllCategoriesForAdmin(db)).toHaveLength(1);
  });

  it("createCategory", async () => {
    const db = freshMocks();
    db.setResponse("nav_categories", { data: { ...mockCat, name: "New" }, error: null });
    expect((await createCategory(db, { name: "New", slug: "new", description: null, icon: "x", sort_order: 5 })).name).toBe("New");
  });

  it("updateCategory", async () => {
    const db = freshMocks();
    db.setResponse("nav_categories", { data: { ...mockCat, name: "Upd" }, error: null });
    expect((await updateCategory(db, "cat-1", { name: "Upd" })).name).toBe("Upd");
  });

  it("deleteCategory 成功", async () => {
    const db = freshMocks();
    db.setResponse("nav_categories", { data: null, error: null });
    await expect(deleteCategory(db, "cat-1")).resolves.toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 链接
// ═══════════════════════════════════════════════════════════════

describe("repositories · 链接", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("getApprovedLinks 成功", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: [mockLinkRow], error: null });
    const result = await getApprovedLinks(db);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("ChatGPT");
  });

  it("getApprovedLinks limit/offset → range", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: [mockLinkRow], error: null });
    await getApprovedLinks(db, { limit: 5, offset: 10 });
    const r = db.callsFor("nav_links").filter(c => c.args[0] === "range");
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it("getApprovedLinks 失败3次后抛错", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: null, error: { code: "PGRST301", message: "timeout" } });
    await expect(getApprovedLinks(db)).rejects.toThrow("Failed to fetch links");
  });

  it("getApprovedLinks 重试3次", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: null, error: { code: "XX", message: "tmp" } });
    try { await getApprovedLinks(db); } catch {}
    const sels = db.callsFor("nav_links").filter(c => c.args[0] === "select");
    expect(sels.length).toBe(3);
  });

  it("getApprovedLinkBySlug slug 匹配", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: { ...mockLinkRow, slug: "chatgpt" }, error: null });
    expect((await getApprovedLinkBySlug(db, "chatgpt"))?.title).toBe("ChatGPT");
  });

  it("getApprovedLinkBySlug 无命中", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: null, error: null });
    expect(await getApprovedLinkBySlug(db, "nonexistent")).toBeNull();
  });

  it("getAllApprovedLinkSlugs", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: [{ slug: "a", title: "A" }, { slug: null, title: "B" }], error: null });
    expect(await getAllApprovedLinkSlugs(db)).toEqual(["a", "b"]);
  });

  it("getRelatedLinks 同分类返回", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: [mockLinkRow], error: null });
    expect(await getRelatedLinks(db, "cat-1", "https://other.com", 3)).toHaveLength(1);
  });

  it("getRelatedLinks categoryId null", async () => {
    expect(await getRelatedLinks(freshMocks(), null, "https://other.com")).toEqual([]);
  });

  it("getApprovedLinksForApi 按分类过滤", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: [mockLinkRow], error: null });
    expect(await getApprovedLinksForApi(db, "ai")).toHaveLength(1);
  });

  it("getApprovedLinksForApi all 回退", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: [mockLinkRow], error: null });
    expect(await getApprovedLinksForApi(db, "all")).toHaveLength(1);
  });

  it("findExistingLinkByUrl 命中", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: { id: "lnk-1", approved: true }, error: null });
    expect((await findExistingLinkByUrl(db, "https://chat.openai.com/"))?.id).toBe("lnk-1");
  });

  it("findExistingLinkByUrl null", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: null, error: null });
    expect(await findExistingLinkByUrl(db, "https://nope.com")).toBeNull();
  });

  it("submitLink 成功", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: null, error: null });
    expect(await submitLink(db, { title: "N", url: "https://n.com", description: null, category_id: null })).toBe(true);
  });

  it("submitLink 失败", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: null, error: { code: "23505", message: "dup" } });
    expect(await submitLink(db, { title: "N", url: "https://n.com", description: null, category_id: null })).toBe(false);
  });

  it("findApprovedLinkByUrl 命中", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: { id: "lnk-1" }, error: null });
    expect((await findApprovedLinkByUrl(db, "https://x.com"))?.id).toBe("lnk-1");
  });

  it("findApprovedLinkByUrl null", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: null, error: null });
    expect(await findApprovedLinkByUrl(db, "https://nope.com")).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// 标签
// ═══════════════════════════════════════════════════════════════

describe("repositories · 标签", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("getAllTagsForAdmin", async () => {
    const db = freshMocks();
    db.setResponse("tags", { data: [mockTagRow], error: null });
    expect((await getAllTagsForAdmin(db))[0].name).toBe("Hot");
  });

  it("createTag", async () => {
    const db = freshMocks();
    db.setResponse("tags", { data: { ...mockTagRow, name: "NewTag" }, error: null });
    expect((await createTag(db, { name: "NewTag", slug: "newtag" })).name).toBe("NewTag");
  });

  it("updateTag", async () => {
    const db = freshMocks();
    db.setResponse("tags", { data: { ...mockTagRow, name: "Upd" }, error: null });
    expect((await updateTag(db, "tag-1", { name: "Upd" })).name).toBe("Upd");
  });

  it("deleteTag", async () => {
    const db = freshMocks();
    db.setResponse("tags", { data: null, error: null });
    await expect(deleteTag(db, "tag-1")).resolves.toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 评价
// ═══════════════════════════════════════════════════════════════

describe("repositories · 评价", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("getToolReviews", async () => {
    const db = freshMocks();
    db.setResponse("public_tool_reviews", { data: [mockReviewRow], error: null });
    expect(await getToolReviews(db, "lnk-1")).toHaveLength(1);
  });

  it("getToolReviews 出错返回[]", async () => {
    const db = freshMocks();
    db.setResponse("public_tool_reviews", { data: null, error: { message: "err" } });
    expect(await getToolReviews(db, "lnk-1")).toEqual([]);
  });

  it("getReviewStats 有数据", async () => {
    const db = freshMocks();
    db.setResponse("tool_review_stats", { data: mockStatsRow, error: null });
    expect((await getReviewStats(db, "lnk-1"))?.avg_rating).toBe(4.5);
  });

  it("getReviewStats null", async () => {
    const db = freshMocks();
    db.setResponse("tool_review_stats", { data: null, error: null });
    expect(await getReviewStats(db, "lnk-1")).toBeNull();
  });

  it("hasUserReviewed 已评价", async () => {
    const db = freshMocks();
    db.setResponse("tool_reviews", { data: [{ id: "r1" }], error: null });
    expect(await hasUserReviewed(db, "lnk-1", "1.1.1.1")).toBe(true);
  });

  it("hasUserReviewed 未评价", async () => {
    const db = freshMocks();
    db.setResponse("tool_reviews", { data: null, error: null });
    expect(await hasUserReviewed(db, "lnk-1", "1.1.1.1")).toBe(false);
  });

  it("createReview", async () => {
    const db = freshMocks();
    db.setResponse("tool_reviews", { data: { ...mockReviewRow, rating: 4 }, error: null });
    expect((await createReview(db, "lnk-1", "1.1.1.1", 4, "Nice"))?.rating).toBe(4);
  });

  it("checkReviewRateLimit 允许", async () => {
    const db = freshMocks();
    db.setResponse("review_rate_limits", { data: { allowed: true }, error: null });
    expect(await checkReviewRateLimit(db, "1.1.1.1")).toBe(true);
  });

  it("recordReviewAttempt", async () => {
    const db = freshMocks();
    db.setResponse("review_rate_limits", { data: null, error: null });
    await expect(recordReviewAttempt(db, "1.1.1.1", "lnk-1")).resolves.toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 用户收藏
// ═══════════════════════════════════════════════════════════════

describe("repositories · 用户收藏", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("getUserFavorites", async () => {
    const db = freshMocks();
    db.setResponse("user_favorites", { data: [{ link_id: "lnk-1" }, { link_id: "lnk-2" }], error: null });
    expect(await getUserFavorites(db, "u1")).toEqual(["lnk-1", "lnk-2"]);
  });

  it("getUserFavorites 出错返回[]", async () => {
    const db = freshMocks();
    db.setResponse("user_favorites", { data: null, error: { message: "err" } });
    expect(await getUserFavorites(db, "u1")).toEqual([]);
  });

  it("addUserFavorites 成功", async () => {
    const db = freshMocks();
    db.setResponse("user_favorites", { data: null, error: null });
    const result = await addUserFavorites(db, "u1", ["lnk-1", "lnk-2"]);
    expect(result.added).toBe(2);
  });

  it("addUserFavorites 出错", async () => {
    const db = freshMocks();
    db.setResponse("user_favorites", { data: null, error: { message: "db err" } });
    const result = await addUserFavorites(db, "u1", ["lnk-1"]);
    expect(result).toHaveProperty("error");
  });

  it("removeUserFavorite", async () => {
    const db = freshMocks();
    db.setResponse("user_favorites", { data: null, error: null });
    expect(await removeUserFavorite(db, "u1", "lnk-1")).toEqual({ ok: true });
  });

  it("clearUserFavorites", async () => {
    const db = freshMocks();
    db.setResponse("user_favorites", { data: null, error: null });
    expect(await clearUserFavorites(db, "u1")).toEqual({ ok: true, cleared: true });
  });
});

// ═══════════════════════════════════════════════════════════════
// Admin 链接 CRUD
// ═══════════════════════════════════════════════════════════════

describe("repositories · Admin 链接 CRUD", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("getAllLinksForAdmin", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: [mockLinkRow], error: null });
    expect(await getAllLinksForAdmin(db)).toHaveLength(1);
  });

  it("createLink 无tag_ids", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: { ...mockLinkRow, id: "new-1" }, error: null });
    expect((await createLink(db, {
      title: "N", url: "https://n.com", description: null, icon: "",
      category_id: null, approved: true, featured: false,
    })).id).toBe("new-1");
  });

  it("createLink 带tag_ids同步标签关联", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: { ...mockLinkRow, id: "new-1" }, error: null });
    db.setResponse("nav_links_tags", { data: null, error: null });
    await createLink(db, {
      title: "N", url: "https://n.com", description: null, icon: "",
      category_id: null, approved: true, featured: false, tag_ids: ["t1", "t2"],
    });
    const del = db.callsFor("nav_links_tags").filter(c => c.args[0] === "delete");
    const ins = db.callsFor("nav_links_tags").filter(c => c.args[0] === "insert");
    expect(del.length).toBeGreaterThanOrEqual(1);
    expect(ins.length).toBeGreaterThanOrEqual(1);
  });

  it("createLink 空tag_ids不操作标签", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: { id: "new-1", ...mockLinkRow }, error: null });
    await createLink(db, {
      title: "N", url: "https://n.com", description: null, icon: "",
      category_id: null, approved: true, featured: false, tag_ids: [],
    });
    const del = db.callsFor("nav_links_tags").filter(c => c.args[0] === "delete");
    expect(del.length).toBe(0);
  });

  it("updateLink 无tag_ids", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: { id: "lnk-1", title: "Upd" }, error: null });
    expect((await updateLink(db, "lnk-1", { title: "Upd" })).title).toBe("Upd");
  });

  it("deleteLink 成功", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: null, error: null });
    await expect(deleteLink(db, "lnk-1")).resolves.toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// 错误边界
// ═══════════════════════════════════════════════════════════════

describe("repositories · 错误边界", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("hasUserReviewed MissingDatabaseMigrationError", async () => {
    const db = freshMocks();
    db.setResponse("tool_reviews", { data: null, error: { code: "PGRST205", message: "no table" } });
    await expect(hasUserReviewed(db, "lnk-1", "1.1.1.1")).rejects.toThrow(/reviews/);
  });

  it("createReview MissingDatabaseMigrationError", async () => {
    const db = freshMocks();
    db.setResponse("tool_reviews", { data: null, error: { code: "PGRST205", message: "no table" } });
    await expect(createReview(db, "lnk-1", "1.1.1.1", 5, null)).rejects.toThrow(/reviews/);
  });
});
