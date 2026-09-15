import { createSql, type Sql } from '@classprints/server/db';
import type { SeatingWorkerBindings } from '../types/env';

export type { Sql };

/**
 * Creates a postgres.js client from the Hyperdrive binding (Neon origin).
 */
export const createDb = (bindings: SeatingWorkerBindings): Sql =>
  createSql({ HYPERDRIVE: bindings.HYPERDRIVE });
