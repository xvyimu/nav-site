import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  // NOTE: globalIgnores() replaces the package's default ignores, so we must
  // re-declare node_modules here, plus the NTFS reparse point ghost dirs that
  // cannot be deleted (see CLAUDE-HANDOFF.md "NTFS Reparse Point 问题").
  globalIgnores([
    // Default ignores of eslint-config-next:
    "node_modules/**",
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Ghost directories from pnpm migration (NTFS reparse points, ~2.4GB, undeletable):
    "node_modules_*/**", // covers node_modules_broken, node_modules_old_*, node_modules_phantom_*
    "deps/**",
    "vendor/**",
    "nm_temp/**",
    // Generated / auxiliary directories:
    "coverage/**",
    ".workbuddy/**",
    "next-phase-tasks/**",
    ".pipeline/**",
    ".pytest_cache/**",
    "**/__pycache__/**",
  ]),
]);

export default eslintConfig;
