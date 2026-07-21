/**
 * Pure helpers for check-links JSON report shape (shared by CLI + unit tests).
 */

/** Build structured report object for --json / --persist / Admin import. */
export function buildLinkHealthReport({
  total,
  ok,
  broken,
  redirects,
  generatedAt,
} = {}) {
  return {
    generatedAt: generatedAt || new Date().toISOString(),
    total: total ?? 0,
    ok: ok ?? 0,
    broken: (broken || []).map((b) => ({
      id: b.id ?? null,
      title: b.title,
      url: b.url,
      status: b.status,
      ...(b.error != null ? { error: b.error } : {}),
    })),
    redirects: (redirects || []).map((r) => ({
      id: r.id ?? null,
      title: r.title,
      url: r.url,
      status: r.status,
      ...(r.location != null ? { location: r.location } : {}),
    })),
  };
}
