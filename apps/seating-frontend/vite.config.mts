import path from 'node:path';
// `vitest/config` re-exports Vite's `defineConfig` with the `test` option
// typed in, so this one config can serve both `vite build`/`vite dev` and
// `vitest run` (see the `test.alias` comment below for why it needs to).
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const resolvePath = (relativePath: string) => path.resolve(__dirname, relativePath);

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  test: {
    // `vite-tsconfig-paths` only path-resolves files covered by
    // tsconfig.json's `include` (vite.config.mts, src, worker) — never
    // `tests/`, which that tsconfig intentionally excludes from
    // typechecking. A workspace-package import written directly inside a
    // test file (rather than inside `src/`, which the plugin does cover)
    // falls through to real package resolution instead, which needs each
    // package's unbuilt `dist/` (package.json `exports`). These aliases
    // mirror the root `vitest.config.ts`'s source-resolution aliases so a
    // test file can import these packages without a build step, matching
    // how every other workspace test already runs.
    alias: [
      {
        find: /^@classprints\/shared\/(.*)$/,
        replacement: resolvePath('../../packages/shared/src/$1'),
      },
      { find: '@classprints/shared', replacement: resolvePath('../../packages/shared/src/index.ts') },
      {
        find: /^@classprints\/seating-shared\/(.*)$/,
        replacement: resolvePath('../../packages/seating-shared/src/$1'),
      },
      {
        find: '@classprints/seating-shared',
        replacement: resolvePath('../../packages/seating-shared/src/index.ts'),
      },
      {
        find: /^@classprints\/assignment-reader-shared\/(.*)$/,
        replacement: resolvePath('../../packages/assignment-reader-shared/src/$1'),
      },
      {
        find: '@classprints/assignment-reader-shared',
        replacement: resolvePath('../../packages/assignment-reader-shared/src/index.ts'),
      },
    ],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4174,
    // Same-origin /api proxy, matching `server.proxy`, so the built SPA talks
    // to the API worker the same way the deployed asset worker does.
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
