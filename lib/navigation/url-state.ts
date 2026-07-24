import type { PopularityFilter } from "@/lib/search-experience";

export interface ParsedUrlFilters {
  q: string;
  cat: string;
  tags: string[];
  minRating: number | null;
  popularity: PopularityFilter | null;
  semantic: boolean;
}

export interface NavigationUrlState {
  search: string;
  activeCategory: string;
  activeTags: string[];
  minRatingFilter: number | null;
  popularityFilter: PopularityFilter | null;
  semanticSearch: boolean;
}

export const DEFAULT_NAVIGATION_FILTERS: ParsedUrlFilters = {
  q: "",
  cat: "all",
  tags: [],
  minRating: null,
  popularity: null,
  semantic: true,
};

function normalizeCategorySlug(slug: string): string {
  return slug === "model-ranking" ? "all" : slug;
}

export function parseFiltersFromUrl(sp: URLSearchParams): ParsedUrlFilters {
  const q = sp.get("q")?.trim() ?? "";
  const catRaw = sp.get("cat")?.trim() || "all";
  const cat = normalizeCategorySlug(catRaw);
  const tags = sp
    .getAll("tag")
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
  const minRatingRaw = sp.get("minRating");
  const minRatingNum = minRatingRaw ? Number(minRatingRaw) : null;
  const minRating =
    minRatingNum !== null &&
    Number.isFinite(minRatingNum) &&
    minRatingNum >= 1 &&
    minRatingNum <= 5
      ? minRatingNum
      : null;
  const popularityRaw = sp.get("popularity");
  const popularity: PopularityFilter | null =
    popularityRaw === "featured" || popularityRaw === "popular" ? popularityRaw : null;
  const semantic = sp.get("semantic") !== "false";

  return { q, cat, tags, minRating, popularity, semantic };
}

/**
 * RSC / page searchParams → ParsedUrlFilters.
 * Accepts App Router searchParams records (string | string[]) or URLSearchParams.
 * Prefer this on the server so shareable ?cat= / ?q= URLs SSR with the same filter state
 * the client will hydrate — avoids DEFAULT_NAVIGATION_FILTERS on SSR + client URL wipe.
 */
export function parseFiltersFromSearchParams(
  input:
    | URLSearchParams
    | Record<string, string | string[] | undefined>
    | null
    | undefined,
): ParsedUrlFilters {
  if (!input) return { ...DEFAULT_NAVIGATION_FILTERS };
  if (input instanceof URLSearchParams) {
    return parseFiltersFromUrl(input);
  }
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== "") sp.append(key, item);
      }
    } else if (value !== "") {
      sp.set(key, value);
    }
  }
  return parseFiltersFromUrl(sp);
}

export function readInitialFilters(): ParsedUrlFilters {
  if (typeof window === "undefined") {
    return { ...DEFAULT_NAVIGATION_FILTERS };
  }
  return parseFiltersFromUrl(new URLSearchParams(window.location.search));
}

export function buildNavigationSearchParams(state: NavigationUrlState): URLSearchParams {
  const sp = new URLSearchParams();
  const trimmedSearch = state.search.trim();
  if (trimmedSearch) sp.set("q", trimmedSearch);
  if (state.activeCategory !== "all") sp.set("cat", state.activeCategory);
  if (state.activeTags.length > 0) sp.set("tag", state.activeTags.join(","));
  if (state.minRatingFilter !== null) sp.set("minRating", String(state.minRatingFilter));
  if (state.popularityFilter) sp.set("popularity", state.popularityFilter);
  if (!state.semanticSearch) sp.set("semantic", "false");
  return sp;
}

export function buildNavigationUrl(state: NavigationUrlState): string {
  const qs = buildNavigationSearchParams(state).toString();
  return qs ? `/?${qs}` : "/";
}
