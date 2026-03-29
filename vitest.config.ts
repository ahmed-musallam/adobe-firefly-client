import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*'],
    coverage: {
      exclude: ['**/flat/**', '**/sdk/**'],
    },
  },
});
