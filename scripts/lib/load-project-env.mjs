/**
 * Shared loader for `.env.local` / optional `.env` used by Node ops scripts.
 * Does not override already-set process.env keys (CLI/CI env wins).
 *
 * Keep logic tiny and dependency-free (no dotenv package).
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * @param {string} projectRoot absolute path to repo root
 * @param {{ files?: string[] }} [options]
 */
export function loadProjectEnv(projectRoot, options = {}) {
  const files = options.files ?? [".env.local", ".env"];
  for (const name of files) {
    const envPath = join(projectRoot, name);
    if (!existsSync(envPath)) continue;
    let text;
    try {
      text = readFileSync(envPath, "utf-8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!key) continue;
      let value = trimmed.slice(eq + 1).trim();
      // strip matching single/double quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined || process.env[key] === "") {
        process.env[key] = value;
      }
    }
  }
}
