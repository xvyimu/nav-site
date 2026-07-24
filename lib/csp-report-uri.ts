/**
 * Path-only URI for logs/Sentry: drop query + hash (tokens/PII often ride there).
 * Keywords / non-URL CSP values (inline, eval, data:…) fall back to string strip.
 */
export function toPathOnlyUri(value: unknown): string {
  if (value == null) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    u.search = "";
    u.hash = "";
    return u.href;
  } catch {
    const noHash = raw.includes("#") ? raw.slice(0, raw.indexOf("#")) : raw;
    const q = noHash.indexOf("?");
    return q === -1 ? noHash : noHash.slice(0, q);
  }
}
