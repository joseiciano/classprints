import postgres from 'postgres';
import type { Hyperdrive } from '@cloudflare/workers-types';

export type Sql = postgres.Sql<Record<string, unknown>>;
export type SqlFactory = (bindings: { HYPERDRIVE: Hyperdrive }) => Sql;

/**
 * Creates a SQL client from a Hyperdrive binding (Neon origin).
 * Each Worker call site wires this with `c.env`.
 */
export const createSql: SqlFactory = (bindings) =>
  postgres(bindings.HYPERDRIVE.connectionString, {
    max: 5,
    fetch_types: false,
    prepare: false,
  });
