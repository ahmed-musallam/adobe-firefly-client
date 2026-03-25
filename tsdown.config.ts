import { defineConfig } from 'tsdown';
import { resolve } from 'path';

const cwd = process.cwd();

export default defineConfig({
  entry: {
    flat: resolve(cwd, 'src/flat/index.ts'),
    sdk: resolve(cwd, 'src/sdk/index.ts'),
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
    onlyBundle: ['ky'], // Bundle only the dependencies that are used in the code
  },
});
