import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

async function getHandler() {
  vi.resetModules();
  return import("@/app/api/favicon/route");
}

describe("favicon API", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("rejects missing domain", async () => {
    const { GET } = await getHandler();
    const response = await GET(new NextRequest("http://localhost/api/favicon"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Missing domain parameter" });
  });

  it("rejects private / blocked hosts without fetching", async () => {
    const { GET } = await getHandler();
    const response = await GET(
      new NextRequest("http://localhost/api/favicon?domain=127.0.0.1")
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Domain not allowed" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns the first valid image response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("x".repeat(128), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      })
    );

    const { GET } = await getHandler();
    const response = await GET(
      new NextRequest("http://localhost/api/favicon?domain=example.com")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-favicon-source")).toBe("cccyun");
  });

  it("races upstream sources and returns the first valid image", async () => {
    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes("favicon.cccyun.cc")) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        });
      }
      if (url.includes("duckduckgo.com")) {
        return Promise.resolve(new Response("x".repeat(128), {
          status: 200,
          headers: { "Content-Type": "image/png" },
        }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });

    const { GET } = await getHandler();
    const pending = GET(
      new NextRequest("http://localhost/api/favicon?domain=example.com")
    );

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    const response = await pending;

    expect(response.status).toBe(200);
    expect(response.headers.get("x-favicon-source")).toBe("duckduckgo");
  });

  it("cancels upstream bodies once the streaming size limit is exceeded", async () => {
    let cancelCount = 0;
    vi.mocked(fetch).mockImplementation(async () => {
      let pulls = 0;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          pulls += 1;
          controller.enqueue(new Uint8Array(300 * 1024));
          if (pulls === 3) controller.close();
        },
        cancel() {
          cancelCount += 1;
        },
      });
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    });

    const { GET } = await getHandler();
    const response = await GET(
      new NextRequest("http://localhost/api/favicon?domain=example.com")
    );

    expect(response.status).toBe(404);
    expect(cancelCount).toBe(3);
  });
});
