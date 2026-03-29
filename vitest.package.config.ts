import { defineConfig } from 'vitest/config';

/**
 * Used by each package's vitest.config.ts when `pnpm test` runs Vitest with that package as cwd.
 * The repo-root vitest.config.ts is for `pnpm test:vitest` (all projects from monorepo root).
 */
export default defineConfig({
  test: {
    coverage: {
      exclude: ['**/flat/**', '**/sdk/**'],
    },
  },
});
