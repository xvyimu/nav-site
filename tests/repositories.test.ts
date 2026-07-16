import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getCategories, getApprovedLinks, getApprovedLinkBySlug, getAllApprovedLinkSlugs,
  getRelatedLinks, getApprovedLinksForApi, queryApprovedLinksForApi, getToolReviews, getReviewStats,
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
//     createClient 需 mockResolvedValue，service/static 客户端直接 mockReturnValue。
//  3. 大多数 repository 函数已不再接受测试 db 参数，需通过工厂 mock 注入。
//  4. MockDB 必须实现 `.upsert()` 和 `.lt()`（部分链路会调用）。

// ═══════════════════════════════════════════════════════════════
// MockDB
// ═══════════════════════════════════════════════════════════════

type MockError = { code?: string; message?: string } | null;
type RowMap = Record<string, { data?: unknown; error?: MockError }>;

class MockDB {
  private rows: RowMap = {};
  private _calls: Record<string, { table: string; args: unknown[] }[]> = {};

  setResponse(table: string, r: { data?: unknown; error?: MockError }) {
    this.rows[table] = r;
  }

  // Chainable methods all return `this` for fluent API
  from(table: string) {
    this._lastTable = table;
    (this._calls[table] ||= []).push({ table, args: ["from"] });
    return this;
  }
  rpc(name: string, args?: unknown) {
    this._lastTable = `rpc:${name}`;
    (this._calls[this._lastTable] ||= []).push({
      table: this._lastTable,
      args: ["rpc", args],
    });
    return Promise.resolve(this._resp());
  }
  select(_c?: string) { this._call("select", _c); return this; }
  eq(c: string, v: unknown) { this._call("eq", c, v); return this; }
  neq(...a: unknown[]) { this._call("neq", ...a); return this; }
  in_(c: string, v: unknown[]) { this._call("in", c, v); return this; }
  /** .in() is the real Supabase chain method name, while .in_() is the JS reserved-word alias */
  in(c: string, v: unknown[]) { return this.in_(c, v); }
  or_(...a: unknown[]) { this._call("or", ...a); return this; }
  order(...a: unknown[]) { this._call("order", ...a); return this; }
  abortSignal(...a: unknown[]) { this._call("abortSignal", ...a); return this; }
  limit(...a: unknown[]) { this._call("limit", ...a); return this; }
  range(...a: unknown[]) { this._call("range", ...a); return this; }
  lt(...a: unknown[]) { this._call("lt", ...a); return this; }
  gte(...a: unknown[]) { this._call("gte", ...a); return this; }
  like(...a: unknown[]) { this._call("like", ...a); return this; }
  ilike(...a: unknown[]) { this._call("ilike", ...a); return this; }
  is(...a: unknown[]) { this._call("is", ...a); return this; }
  or(...a: unknown[]) { this._call("or", ...a); return this; }
  match(...a: unknown[]) { this._call("match", ...a); return this; }
  filter(...a: unknown[]) { this._call("filter", ...a); return this; }
  not(...a: unknown[]) { this._call("not", ...a); return this; }
  contains(...a: unknown[]) { this._call("contains", ...a); return this; }
  textSearch(...a: unknown[]) { this._call("textSearch", ...a); return this; }
  foreignTable(...a: unknown[]) { this._call("foreignTable", ...a); return this; }

  callsFor(table: string) {
    return this._calls[table] ?? [];
  }

  // Terminal async methods
  maybeSingle() { return Promise.resolve(this._resp()); }
  single() { return Promise.resolve(this._resp()); }
  insert(...a: unknown[]) { this._call("insert", ...a); return this; }
  update(...a: unknown[]) { this._call("update", ...a); return this; }
  upsert(_r: unknown, ...a: unknown[]) { this._call("upsert", ...a); return this; }
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

function asClient(db: MockDB): Awaited<ReturnType<typeof createClient>> {
  return db as unknown as Awaited<ReturnType<typeof createClient>>;
}

/** 每个测试调用一次，三个工厂均返回此 db 实例 */
function freshMocks() {
  const db = new MockDB();
  const client = asClient(db);
  vi.mocked(createClient).mockResolvedValue(client);
  vi.mocked(createStaticClient).mockReturnValue(client);
  vi.mocked(createServiceRoleClient).mockReturnValue(
    client as ReturnType<typeof createServiceRoleClient>
  );
  return db;
}

function expectAdminClientOnly() {
  expect(createServiceRoleClient).toHaveBeenCalled();
  expect(createClient).not.toHaveBeenCalled();
}

// ═══════════════════════════════════════════════════════════════
// 测试数据
// ═══════════════════════════════════════════════════════════════

const mockCat = { id: "cat-1", name: "AI", slug: "ai", description: "AI tools", icon: "bot", sort_order: 1, created_at: "2026-01-01", parent_id: null };
const mockLinkRow = {
  id: "lnk-1", title: "ChatGPT", url: "https://chat.openai.com/", description: "AI chat",
  category_id: "cat-1", approved: true, paid: false, featured: true,
  created_at: "2026-01-01", updated_at: "2026-01-01", click_count: 10,
  embedding: [0.1, 0.2], embedding_1024: [0.3, 0.4],
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
    const result = await getCategories(asClient(db));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("AI");
  });

  it("getCategories forwards AbortSignal to Supabase", async () => {
    const db = freshMocks();
    const signal = AbortSignal.timeout(1000);
    db.setResponse("nav_categories", { data: [mockCat], error: null });

    const result = await getCategories({ client: asClient(db), signal });

    expect(result).toHaveLength(1);
    expect(db.callsFor("nav_categories").some((call) => call.args[0] === "abortSignal")).toBe(true);
  });

  it("getCategories 出错抛异常", async () => {
    const db = freshMocks();
    db.setResponse("nav_categories", { data: null, error: { code: "PGRST205", message: "no table" } });
    await expect(getCategories(asClient(db))).rejects.toThrow("Failed to fetch categories");
  });

  it("getAllCategoriesForAdmin", async () => {
    const db = freshMocks();
    db.setResponse("nav_categories", { data: [mockCat], error: null });
    expect(await getAllCategoriesForAdmin()).toHaveLength(1);
    expectAdminClientOnly();
  });

  it("createCategory", async () => {
    const db = freshMocks();
    db.setResponse("nav_categories", { data: { ...mockCat, name: "New" }, error: null });
    expect((await createCategory({ name: "New", slug: "new", description: null, icon: "x", sort_order: 5 })).name).toBe("New");
    expectAdminClientOnly();
  });

  it("updateCategory", async () => {
    const db = freshMocks();
    db.setResponse("nav_categories", { data: { ...mockCat, name: "Upd" }, error: null });
    expect((await updateCategory("cat-1", { name: "Upd" })).name).toBe("Upd");
    expectAdminClientOnly();
  });

  it("deleteCategory 成功", async () => {
    const db = freshMocks();
    db.setResponse("nav_categories", { data: null, error: null });
    await expect(deleteCategory("cat-1")).resolves.toBeUndefined();
    expectAdminClientOnly();
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
    const result = await getApprovedLinks();
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("ChatGPT");
    expect(result[0]).not.toHaveProperty("embedding");
    expect(result[0]).not.toHaveProperty("embedding_1024");

    const selectCall = db.callsFor("nav_links").find((call) => call.args[0] === "select");
    expect(selectCall?.args[1]).not.toContain("*");
    expect(selectCall?.args[1]).not.toContain("embedding");
  });

  it("getApprovedLinks 标签表缺失时降级为空标签", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = freshMocks();
    db.setResponse("nav_links", { data: [mockLinkRow], error: null });
    db.setResponse("nav_links_tags", { data: null, error: { code: "PGRST205", message: "no table" } });

    try {
      const result = await getApprovedLinks();

      expect(result).toHaveLength(1);
      expect(result[0].tags).toEqual([]);
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("Optional tags tables unavailable"));
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining("Tags tables unavailable"));
    } finally {
      infoSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it("getApprovedLinks limit/offset → range", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: [mockLinkRow], error: null });
    await getApprovedLinks({ limit: 5, offset: 10 });
    const r = db.callsFor("nav_links").filter(c => c.args[0] === "range");
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it("getApprovedLinks 失败3次后抛错", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: null, error: { code: "PGRST301", message: "timeout" } });
    await expect(getApprovedLinks()).rejects.toThrow("Failed to fetch links");
  });

  it("getApprovedLinks 重试3次", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: null, error: { code: "XX", message: "tmp" } });
    try { await getApprovedLinks(); } catch {}
    const sels = db.callsFor("nav_links").filter(c => c.args[0] === "select");
    expect(sels.length).toBe(3);
  });

  it("getApprovedLinkBySlug slug 匹配", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: { ...mockLinkRow, slug: "chatgpt" }, error: null });
    expect((await getApprovedLinkBySlug("chatgpt"))?.title).toBe("ChatGPT");
  });

  it("getApprovedLinkBySlug 无命中", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: null, error: null });
    expect(await getApprovedLinkBySlug("nonexistent")).toBeNull();
  });

  it("getAllApprovedLinkSlugs", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: [{ slug: "a", title: "A" }, { slug: null, title: "B" }], error: null });
    expect(await getAllApprovedLinkSlugs(asClient(db))).toEqual(["a", "b"]);
  });

  it("getRelatedLinks 同分类返回", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: [mockLinkRow], error: null });
    expect(await getRelatedLinks("cat-1", "https://other.com", 3)).toHaveLength(1);
  });

  it("getRelatedLinks categoryId null", async () => {
    freshMocks();
    expect(await getRelatedLinks(null, "https://other.com")).toEqual([]);
  });

  it("getApprovedLinksForApi 按分类过滤", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: [mockLinkRow], error: null });
    expect(await getApprovedLinksForApi("ai")).toHaveLength(1);

    const selectCall = db.callsFor("nav_links").find((call) => call.args[0] === "select");
    expect(selectCall?.args[1]).toContain("nav_categories!inner(name, slug)");
  });

  it("getApprovedLinksForApi all 回退", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: [mockLinkRow], error: null });
    expect(await getApprovedLinksForApi("all")).toHaveLength(1);
  });

  it("queryApprovedLinksForApi pushes filters and count into the database RPC", async () => {
    const db = freshMocks();
    db.setResponse("rpc:list_public_tools", {
      data: [{
        ...mockLinkRow,
        category_name: "AI",
        category_slug: "ai",
        total_count: 12,
      }],
      error: null,
    });

    const result = await queryApprovedLinksForApi({
      category: "ai",
      search: "chat",
      ids: ["lnk-1"],
      limit: 10,
    });

    expect(result.total).toBe(12);
    expect(result.links[0].category_name).toBe("AI");
    expect(db.callsFor("rpc:list_public_tools")[0]?.args).toEqual([
      "rpc",
      {
        p_category_slug: "ai",
        p_ids: ["lnk-1"],
        p_search: "chat",
        p_limit: 10,
      },
    ]);
  });

  it("findExistingLinkByUrl 命中", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: { id: "lnk-1", approved: true }, error: null });
    expect((await findExistingLinkByUrl("https://chat.openai.com/"))?.id).toBe("lnk-1");
  });

  it("findExistingLinkByUrl null", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: null, error: null });
    expect(await findExistingLinkByUrl("https://nope.com")).toBeNull();
  });

  it("submitLink 成功", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: null, error: null });
    expect(await submitLink({ title: "N", url: "https://n.com", description: null, category_id: null })).toEqual({
      ok: true,
    });
  });

  it("submitLink 失败", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: null, error: { code: "23505", message: "dup" } });
    expect(await submitLink({ title: "N", url: "https://n.com", description: null, category_id: null })).toEqual({
      ok: false,
      duplicate: true,
    });
  });

  it("findApprovedLinkByUrl 命中", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: { id: "lnk-1" }, error: null });
    expect((await findApprovedLinkByUrl("https://x.com"))?.id).toBe("lnk-1");
  });

  it("findApprovedLinkByUrl null", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: null, error: null });
    expect(await findApprovedLinkByUrl("https://nope.com")).toBeNull();
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
    expect((await getAllTagsForAdmin())[0].name).toBe("Hot");
    expectAdminClientOnly();
  });

  it("createTag", async () => {
    const db = freshMocks();
    db.setResponse("tags", { data: { ...mockTagRow, name: "NewTag" }, error: null });
    expect((await createTag({ name: "NewTag", slug: "newtag" })).name).toBe("NewTag");
    expectAdminClientOnly();
  });

  it("updateTag", async () => {
    const db = freshMocks();
    db.setResponse("tags", { data: { ...mockTagRow, name: "Upd" }, error: null });
    expect((await updateTag("tag-1", { name: "Upd" })).name).toBe("Upd");
    expectAdminClientOnly();
  });

  it("deleteTag", async () => {
    const db = freshMocks();
    db.setResponse("tags", { data: null, error: null });
    await expect(deleteTag("tag-1")).resolves.toBeUndefined();
    expectAdminClientOnly();
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
    expect(await getToolReviews("lnk-1")).toHaveLength(1);
  });

  it("getToolReviews 出错返回[]", async () => {
    const db = freshMocks();
    db.setResponse("public_tool_reviews", { data: null, error: { message: "err" } });
    expect(await getToolReviews("lnk-1")).toEqual([]);
  });

  it("getReviewStats 有数据", async () => {
    const db = freshMocks();
    db.setResponse("tool_review_stats", { data: mockStatsRow, error: null });
    expect((await getReviewStats("lnk-1"))?.avg_rating).toBe(4.5);
  });

  it("getReviewStats null", async () => {
    const db = freshMocks();
    db.setResponse("tool_review_stats", { data: null, error: null });
    expect(await getReviewStats("lnk-1")).toBeNull();
  });

  it("hasUserReviewed 已评价", async () => {
    const db = freshMocks();
    db.setResponse("tool_reviews", { data: [{ id: "r1" }], error: null });
    expect(await hasUserReviewed("lnk-1", "1.1.1.1")).toBe(true);
  });

  it("hasUserReviewed 未评价", async () => {
    const db = freshMocks();
    db.setResponse("tool_reviews", { data: null, error: null });
    expect(await hasUserReviewed("lnk-1", "1.1.1.1")).toBe(false);
  });

  it("createReview", async () => {
    const db = freshMocks();
    db.setResponse("tool_reviews", { data: { ...mockReviewRow, rating: 4 }, error: null });
    expect((await createReview("lnk-1", "1.1.1.1", 4, "Nice"))?.rating).toBe(4);
  });

  it("checkReviewRateLimit 允许", async () => {
    const db = freshMocks();
    db.setResponse("review_rate_limits", { data: { allowed: true }, error: null });
    expect(await checkReviewRateLimit("1.1.1.1")).toBe(true);
  });

  it("recordReviewAttempt", async () => {
    const db = freshMocks();
    db.setResponse("review_rate_limits", { data: null, error: null });
    await expect(recordReviewAttempt("1.1.1.1", "lnk-1")).resolves.toBeUndefined();
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
    expect(await getUserFavorites("u1")).toEqual(["lnk-1", "lnk-2"]);
  });

  it("getUserFavorites 出错返回[]", async () => {
    const db = freshMocks();
    db.setResponse("user_favorites", { data: null, error: { message: "err" } });
    expect(await getUserFavorites("u1")).toEqual([]);
  });

  it("addUserFavorites 成功", async () => {
    const db = freshMocks();
    db.setResponse("user_favorites", {
      data: [{ link_id: "lnk-1" }, { link_id: "lnk-2" }],
      error: null,
    });
    const result = await addUserFavorites(asClient(db), "u1", ["lnk-1", "lnk-2"]);
    expect(result).toEqual({ added: 2 });
  });

  it("addUserFavorites 出错", async () => {
    const db = freshMocks();
    db.setResponse("user_favorites", { data: null, error: { message: "db err" } });
    const result = await addUserFavorites(asClient(db), "u1", ["lnk-1"]);
    expect(result).toHaveProperty("error");
  });

  it("removeUserFavorite", async () => {
    const db = freshMocks();
    db.setResponse("user_favorites", { data: null, error: null });
    expect(await removeUserFavorite("u1", "lnk-1")).toEqual({ ok: true });
  });

  it("clearUserFavorites", async () => {
    const db = freshMocks();
    db.setResponse("user_favorites", { data: null, error: null });
    expect(await clearUserFavorites("u1")).toEqual({ ok: true, cleared: true });
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
    expect(await getAllLinksForAdmin()).toHaveLength(1);
    expectAdminClientOnly();
  });

  it("createLink 无tag_ids", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: { ...mockLinkRow, id: "new-1" }, error: null });
    expect((await createLink({
      title: "N", url: "https://n.com", description: null, icon: "",
      category_id: null, approved: true, featured: false,
    })).id).toBe("new-1");
    expectAdminClientOnly();
  });

  it("createLink 带tag_ids同步标签关联", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: { ...mockLinkRow, id: "new-1" }, error: null });
    db.setResponse("nav_links_tags", { data: null, error: null });
    await createLink({
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
    db.setResponse("nav_links", { data: { ...mockLinkRow, id: "new-1" }, error: null });
    await createLink({
      title: "N", url: "https://n.com", description: null, icon: "",
      category_id: null, approved: true, featured: false, tag_ids: [],
    });
    const del = db.callsFor("nav_links_tags").filter(c => c.args[0] === "delete");
    expect(del.length).toBe(0);
  });

  it("updateLink 无tag_ids", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: { id: "lnk-1", title: "Upd" }, error: null });
    expect((await updateLink("lnk-1", { title: "Upd" })).title).toBe("Upd");
    expectAdminClientOnly();
  });

  it("deleteLink 成功", async () => {
    const db = freshMocks();
    db.setResponse("nav_links", { data: null, error: null });
    await expect(deleteLink("lnk-1")).resolves.toBeUndefined();
    expectAdminClientOnly();
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
    await expect(hasUserReviewed("lnk-1", "1.1.1.1")).rejects.toThrow(/reviews/);
  });

  it("createReview MissingDatabaseMigrationError", async () => {
    const db = freshMocks();
    db.setResponse("tool_reviews", { data: null, error: { code: "PGRST205", message: "no table" } });
    await expect(createReview("lnk-1", "1.1.1.1", 5, null)).rejects.toThrow(/reviews/);
  });
});
