import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  addUserFavorites,
  clearUserFavorites,
  getUserFavorites,
  removeUserFavorite,
} from "@/lib/repositories/favorites";

class FavoritesMockDB {
  private rows: Record<string, { data?: unknown; error?: { message?: string } | null }> = {};
  private lastTable = "";
  calls: Record<string, unknown[][]> = {};

  setResponse(table: string, response: { data?: unknown; error?: { message?: string } | null }) {
    this.rows[table] = response;
  }

  from(table: string) {
    this.lastTable = table;
    this.call("from", table);
    return this;
  }

  select(...args: unknown[]) { this.call("select", ...args); return this; }
  eq(...args: unknown[]) { this.call("eq", ...args); return this; }
  delete(...args: unknown[]) { this.call("delete", ...args); return this; }
  upsert(...args: unknown[]) { this.call("upsert", ...args); return this; }

  private call(...args: unknown[]) {
    (this.calls[this.lastTable] ||= []).push(args);
  }

  private response() {
    const response = this.rows[this.lastTable] ?? {};
    return { data: response.data ?? null, error: response.error ?? null };
  }

  get data() { return this.response().data; }
  get error() { return this.response().error; }
}

const mockDb = new FavoritesMockDB();

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: vi.fn(() => mockDb),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("repositories/favorites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockDb.calls)) delete mockDb.calls[key];
    mockDb.setResponse("user_favorites", { data: null, error: null });
  });

  it("reads a user's favorite link ids", async () => {
    mockDb.setResponse("user_favorites", {
      data: [{ link_id: "lnk-1" }, { link_id: "lnk-2" }],
      error: null,
    });

    await expect(getUserFavorites("user-1")).resolves.toEqual(["lnk-1", "lnk-2"]);
    expect(mockDb.calls.user_favorites.some((call) => call[0] === "eq" && call[1] === "user_id")).toBe(true);
  });

  it("upserts favorites with a user/link uniqueness conflict target", async () => {
    mockDb.setResponse("user_favorites", {
      data: [{ link_id: "lnk-1" }],
      error: null,
    });
    const result = await addUserFavorites(
      mockDb as unknown as Parameters<typeof addUserFavorites>[0],
      "user-1",
      ["lnk-1", "lnk-existing"]
    );

    expect(result).toEqual({ added: 1 });
    expect(mockDb.calls.user_favorites).toContainEqual([
      "upsert",
      [
        { user_id: "user-1", link_id: "lnk-1" },
        { user_id: "user-1", link_id: "lnk-existing" },
      ],
      { onConflict: "user_id,link_id", ignoreDuplicates: true },
    ]);
  });

  it("removes one favorite by user and link", async () => {
    await expect(removeUserFavorite("user-1", "lnk-1")).resolves.toEqual({ ok: true });

    expect(mockDb.calls.user_favorites).toContainEqual(["delete"]);
    expect(mockDb.calls.user_favorites).toContainEqual(["eq", "user_id", "user-1"]);
    expect(mockDb.calls.user_favorites).toContainEqual(["eq", "link_id", "lnk-1"]);
  });

  it("clears all favorites for one user", async () => {
    await expect(clearUserFavorites("user-1")).resolves.toEqual({ ok: true, cleared: true });

    expect(mockDb.calls.user_favorites).toContainEqual(["delete"]);
    expect(mockDb.calls.user_favorites).toContainEqual(["eq", "user_id", "user-1"]);
  });
});
