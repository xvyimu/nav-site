import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: [
      "node_modules/**",
      "node_modules_*/**",
      ".next/**",
      "nav-site-audit/**",
      "ai-nav-research/**",
      "deps/**",
    ],
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage",
      include: ["lib/**", "app/api/**", "components/**"],
      exclude: [
        "node_modules/**",
        ".next/**",
        "**/*.test.*",
        "**/*.config.*",
        "**/types.ts",
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
    // Workaround: NTFS reparse point directories in node_modules confuse vite.
    // preserveSymlinks: true tells vite to use directories as-is instead of
    // trying to resolve reparse point targets (which point to deleted pnpm store).
    preserveSymlinks: true,
  },
});
