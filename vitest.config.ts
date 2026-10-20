import path from 'node:path';
import { defineConfig } from 'vitest/config';

const resolvePath = (relativePath: string) => path.resolve(__dirname, relativePath);

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'apps/**/tests/**/*.test.ts',
      'apps/**/tests/**/*.test.tsx',
      'packages/**/tests/**/*.test.ts',
    ],
    // Tests-first contract specs for Tickets 7-8 (upload flow, hierarchy and
    // processing views). Their implementations ship in the tickets 3-9 PR, so
    // they cannot resolve on this branch. That PR removes this exclusion.
    exclude: [
      '**/node_modules/**',
      'apps/seating-frontend/tests/upload-flow.test.ts',
      'apps/seating-frontend/tests/hierarchy-views.test.tsx',
      'apps/seating-frontend/tests/processing-view.test.tsx',
    ],
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
      {
        find: /^@classprints\/assignment-reader-shared\/(.*)$/,
        replacement: resolvePath('packages/assignment-reader-shared/src/$1'),
      },
      {
        find: '@classprints/assignment-reader-shared',
        replacement: resolvePath('packages/assignment-reader-shared/src/index.ts'),
      },
    ],
  },
});
