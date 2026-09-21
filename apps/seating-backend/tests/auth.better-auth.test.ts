import postgres from 'postgres';
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createAuth, type BetterAuthConfig } from '@classprints/server/auth/better-auth/auth';
import type { Sql } from '@classprints/server/db/sql';

// Regression tests for the deployed sign-in/sign-up hang: postgres.js
// (`fetch_types: false`) never resolves `reserve()` on a pool with no open
// connection, and Better Auth's Kysely dialect acquires every connection via
// `reserve()` — so every auth request hung forever. The server now relies on
// the default `fetch_types: true`; these tests pin the contract that auth
// requests settle with normal errors.
//
// Requires a reachable Postgres instance: TEST_DATABASE_URL. Skips otherwise
// so the standard suite stays hermetic. The watchdog below is a deliberate
// wall-clock race against a hang that exposes no awaitable signal — the bug
// under test is precisely that the promise never settles.
const databaseUrl = process.env.TEST_DATABASE_URL;

const sql = databaseUrl
  ? postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 10 })
  : undefined;

const authConfig: BetterAuthConfig = {
  secret: 'test-secret-value-at-least-32-characters',
  baseUrl: 'http://localhost:5173',
  trustedOrigins: ['http://localhost:5173'],
};

beforeAll(() => {
  if (!databaseUrl) {
    console.warn('TEST_DATABASE_URL not set; skipping Better Auth integration checks');
  }
});

afterAll(async () => {
  await sql?.end({ timeout: 1 });
});

// Races `pending` against an 8s watchdog so a regression hang fails fast with
// a diagnosable assertion instead of stalling the suite.
const settleWithinWatchdog = async (pending: Promise<unknown>): Promise<unknown> => {
  // Promise.withResolvers is unavailable on the repo's Node 20 floor.
  const watchdog = new Promise<'timed-out'>((resolve) => {
    setTimeout(() => resolve('timed-out'), 8000);
  });
  return Promise.race([
    pending.then(
      () => 'resolved',
      (error: unknown) => ({ rejected: error instanceof Error ? error.message : String(error) }),
    ),
    watchdog,
  ]);
};

describe.skipIf(!databaseUrl)('Better Auth against live Postgres', () => {
  it('rejects sign-in with bad credentials instead of hanging', async () => {
    expect(sql).toBeDefined();
    const auth = createAuth(sql as Sql, authConfig);

    const outcome = await settleWithinWatchdog(
      auth.api.signInEmail({
        body: { email: 'no-such-user@example.com', password: 'wrong-password', rememberMe: true },
        headers: new Headers({
          Origin: 'http://localhost:5173',
          'Content-Type': 'application/json',
        }),
      }),
    );

    expect(outcome).not.toBe('timed-out');
    expect(outcome).not.toBe('resolved');
  });

  it('creates an account through sign-up without hanging', async () => {
    expect(sql).toBeDefined();
    const auth = createAuth(sql as Sql, authConfig);
    const email = `auth-regression-${Date.now()}@example.com`;
    const headers = new Headers({
      Origin: 'http://localhost:5173',
      'Content-Type': 'application/json',
    });

    const outcome = await settleWithinWatchdog(
      auth.api.signUpEmail({
        body: { email, password: 'correct-horse-battery', name: 'Regression Test' },
        headers,
      }),
    );

    expect(outcome).toBe('resolved');
  });
});
