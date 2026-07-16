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
        lines: 50,
        functions: 40,
        branches: 40,
        statements: 50,
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
