import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

type PackageScripts = {
  scripts?: Record<string, string>;
};

function readPackageScripts(): Record<string, string> {
  const packagePath = join(process.cwd(), "package.json");
  const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as PackageScripts;
  return pkg.scripts ?? {};
}

describe("package.json webpack bundler lock", () => {
  it("keeps dev and build on webpack (no silent Turbopack default)", () => {
    const scripts = readPackageScripts();

    expect(scripts.dev).toBeDefined();
    expect(scripts.build).toBeDefined();

    // Next 16 defaults toward Turbopack; ChronoPortal pins webpack for
    // prod-compatible builds/plugins (docs/PROJECT.md · AGENTS.md).
    expect(scripts.dev).toContain("--webpack");
    expect(scripts.build).toContain("--webpack");

    // Port contract for local dev (PRODUCT-LAYERS L2).
    expect(scripts.dev).toMatch(/(?:^|\s)-p\s+3264(?:\s|$)/);

    // Explicit anti-drift: do not flip the entrypoints to turbopack flags.
    expect(scripts.dev).not.toMatch(/--turbopack\b/);
    expect(scripts.build).not.toMatch(/--turbopack\b/);
  });

  it("routes analyze through the locked build script", () => {
    const scripts = readPackageScripts();
    expect(scripts.analyze).toBe("node scripts/analyze.mjs");

    const analyzeSrc = readFileSync(
      join(process.cwd(), "scripts", "analyze.mjs"),
      "utf8"
    );
    // analyze must spawn `pnpm run build` so --webpack rides on package scripts
    // (comments may mention bare `next build`; only the spawn args matter).
    expect(analyzeSrc).toMatch(
      /spawn\s*\(\s*pnpmCmd\s*,\s*\[\s*["']run["']\s*,\s*["']build["']\s*\]/
    );
    expect(analyzeSrc).not.toMatch(
      /spawn\s*\([^)]*next[^)]*build/i
    );
  });
});
