import postgres from 'postgres';
import type { Hyperdrive } from '@cloudflare/workers-types';

export type Sql = postgres.Sql<Record<string, unknown>>;
export type SqlFactory = (bindings: { HYPERDRIVE: Hyperdrive }) => Sql;

/**
 * Creates a SQL client from a Hyperdrive binding (Neon origin).
 * Each Worker call site wires this with `c.env`.
 *
 * `fetch_types` stays at its default (true): with `fetch_types: false`,
 * postgres.js never resolves `reserve()` on a pool with no open connection
 * (the connection-ready path drops the reserve handshake and no follow-up
 * query triggers `onopen`). Kysely — used by Better Auth — acquires every
 * connection via `reserve()`, so every auth request hung forever. The
 * one-off pg_type query per new connection is acceptable next to that.
 */
export const createSql: SqlFactory = (bindings) =>
  postgres(bindings.HYPERDRIVE.connectionString, {
    max: 5,
    prepare: false,
  });
