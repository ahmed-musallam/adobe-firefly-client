import { defineConfig } from 'tsdown';
import { resolve } from 'node:path';

const cwd = process.cwd();

export default defineConfig({
  entry: {
    flat: resolve(cwd, 'src/entries/flat.ts'),
    sdk: resolve(cwd, 'src/entries/sdk.ts'),
  },
  outDir: resolve(cwd, 'dist'),
  format: ['esm', 'cjs'],
  dts: true,
  minify: true,
  report: {
    gzip: true,
    brotli: true,
  },
  deps: {
    neverBundle: ['ky'],
  },
});
