/**
 * DEV.to public API fetcher (no auth required for list endpoints).
 * https://developers.forem.com/api
 */
const DEFAULT_BASE = "https://dev.to/api";

/**
 * @param {{ tag?: string, perPage?: number, page?: number, baseUrl?: string, fetchImpl?: typeof fetch }} opts
 */
export async function fetchDevtoArticles(opts = {}) {
  const {
    tag = "ai",
    perPage = 20,
    page = 1,
    baseUrl = DEFAULT_BASE,
    fetchImpl = globalThis.fetch,
  } = opts;

  if (perPage < 1 || perPage > 100) {
    throw new Error("perPage must be 1..100");
  }

  const url = new URL(`${baseUrl.replace(/\/$/, "")}/articles`);
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("page", String(page));
  if (tag) url.searchParams.set("tag", tag);

  const res = await fetchImpl(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "nav-site-resource-ingest/0.1 (+local; dry-run)",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`dev.to API HTTP ${res.status}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error("dev.to API returned non-array");
  }
  return data;
}
