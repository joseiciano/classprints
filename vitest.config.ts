import path from 'node:path';
import { defineConfig } from 'vitest/config';

const resolvePath = (relativePath: string) => path.resolve(__dirname, relativePath);

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['apps/**/tests/**/*.test.ts', 'apps/**/tests/**/*.test.tsx'],
    setupFiles: [resolvePath('tests/vitest.setup.ts')],
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  resolve: {
    alias: [
      {
        find: /^@classprints\/shared\/(.*)$/,
        replacement: resolvePath('packages/shared/src/$1'),
      },
      { find: '@classprints/shared', replacement: resolvePath('packages/shared/src/index.ts') },
      {
        find: /^@classprints\/server\/(.*)$/,
        replacement: resolvePath('packages/server/src/$1'),
      },
      { find: '@classprints/server', replacement: resolvePath('packages/server/src/index.ts') },
      {
        find: /^@classprints\/seating-shared\/(.*)$/,
        replacement: resolvePath('packages/seating-shared/src/$1'),
      },
      {
        find: '@classprints/seating-shared',
        replacement: resolvePath('packages/seating-shared/src/index.ts'),
      },
      {
        find: '@hono-rate-limiter/cloudflare',
        replacement: resolvePath('tests/mocks/hono-rate-limiter-cloudflare.ts'),
      },
    ],
  },
});
