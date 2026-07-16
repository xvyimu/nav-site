import { act, fireEvent, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SessionState = {
  data: { user: { id: string } } | null;
  status: "authenticated" | "unauthenticated";
};

const session = vi.hoisted((): { value: SessionState } => ({
  value: { data: null, status: "unauthenticated" },
}));

vi.mock("next-auth/react", () => ({
  useSession: () => session.value,
}));

describe("favorites client synchronization", () => {
  beforeEach(() => {
    localStorage.clear();
    session.value = { data: null, status: "unauthenticated" };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads anonymous favorites after login and merges server favorites", async () => {
    localStorage.setItem("nav-favorites", JSON.stringify(["local-id"]));
    session.value = {
      data: { user: { id: "user-1" } },
      status: "authenticated",
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method || init.method === "GET") {
        return new Response(JSON.stringify({ favorites: ["server-id"] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true, added: 1 }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { useFavorites } = await import("@/lib/use-favorites");

    const { result } = renderHook(() => useFavorites());

    await waitFor(() => {
      expect(new Set(result.current.favoriteIds)).toEqual(new Set(["local-id", "server-id"]));
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/favorites",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ linkIds: ["local-id"] }),
      })
    );
  });

  it("rolls back an optimistic toggle when the server write keeps failing", async () => {
    session.value = {
      data: { user: { id: "user-1" } },
      status: "authenticated",
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method || init.method === "GET") {
        return new Response(JSON.stringify({ favorites: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("failed", { status: 503 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { useFavorites } = await import("@/lib/use-favorites");
    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(result.current.mounted).toBe(true));

    act(() => result.current.toggleFavorite("rollback-id"));
    expect(result.current.isFavorite("rollback-id")).toBe(true);

    await waitFor(() => expect(result.current.isFavorite("rollback-id")).toBe(false));
    const writeCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(writeCalls).toHaveLength(2);
  });

  it("re-renders only the membership subscriber whose link changed", async () => {
    const { FavoritesProvider, useFavoriteMembership, useFavoritesActions } = await import(
      "@/components/FavoritesProvider"
    );
    const renders = { first: 0, second: 0 };

    function Probe({ id }: { id: "first" | "second" }) {
      renders[id] += 1;
      const selected = useFavoriteMembership(id);
      return <span data-testid={id}>{selected ? "yes" : "no"}</span>;
    }

    function Toggle() {
      const { toggleFavorite } = useFavoritesActions();
      return <button onClick={() => toggleFavorite("first")}>toggle</button>;
    }

    const view = render(
      <FavoritesProvider>
        <Probe id="first" />
        <Probe id="second" />
        <Toggle />
      </FavoritesProvider>
    );
    await waitFor(() => expect(view.getByTestId("first").textContent).toBe("no"));
    renders.first = 0;
    renders.second = 0;

    fireEvent.click(view.getByRole("button", { name: "toggle" }));
    await waitFor(() => expect(view.getByTestId("first").textContent).toBe("yes"));

    expect(renders.first).toBeGreaterThan(0);
    expect(renders.second).toBe(0);
  });
});
