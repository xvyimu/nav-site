/** DTO for Admin link-health UI/API. Kept out of repositories so client components do not import data-access deep modules. */

export type LinkHealthKind = "broken" | "redirect";

export interface LinkHealthFinding {
  id: string;
  link_id: string | null;
  title: string;
  url: string;
  http_status: string;
  detail: string | null;
  kind: LinkHealthKind;
  checked_at: string;
  resolved_at: string | null;
  run_id: string | null;
}

/** Structured report shape (CLI --json / admin import). */
export interface LinkHealthReport {
  generatedAt: string;
  total: number;
  ok: number;
  broken: Array<{
    id?: string | null;
    title: string;
    url: string;
    status: string | number;
    error?: string;
  }>;
  redirects: Array<{
    id?: string | null;
    title: string;
    url: string;
    status: string | number;
    location?: string;
  }>;
}
