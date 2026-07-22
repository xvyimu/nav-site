/**
 * Server-only CSP helpers (Next `headers()`).
 * Keep browser-safe builders in `lib/csp.ts`.
 */

import { CSP_NONCE_HEADER, readCspFlags } from "@/lib/csp";

/**
 * Read per-request CSP nonce only when CSP_DYNAMIC=1.
 * Avoids calling headers() (dynamic rendering) on the default static path.
 */
export async function getCspNonce(): Promise<string | undefined> {
  if (!readCspFlags().dynamic) return undefined;
  const { headers } = await import("next/headers");
  const h = await headers();
  return h.get(CSP_NONCE_HEADER) ?? undefined;
}
