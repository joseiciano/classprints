import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Package-scoped vitest config (TEST-009): `pnpm --filter <pkg> test` runs
 * from this app directory, so the root config's root-relative include globs
 * match nothing. This config scopes discovery to this app while keeping the
 * root setup file and cross-package aliases.
 */
const repoRoot = path.resolve(__dirname, '../..');

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: [path.join(repoRoot, 'tests/vitest.setup.ts')],
  },
  resolve: {
    alias: [
      {
        find: /^@classprints\/assignment-reader-shared\/(.*)$/,
        replacement: path.join(repoRoot, 'packages/assignment-reader-shared/src/$1'),
      },
      {
        find: '@classprints/assignment-reader-shared',
        replacement: path.join(repoRoot, 'packages/assignment-reader-shared/src/index.ts'),
      },
      {
        find: /^@classprints\/server\/(.*)$/,
        replacement: path.join(repoRoot, 'packages/server/src/$1'),
      },
      { find: '@classprints/server', replacement: path.join(repoRoot, 'packages/server/src/index.ts') },
    ],
  },
});
