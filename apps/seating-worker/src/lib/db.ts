import { createSql, type Sql } from '@classprints/server/db';
import type { SeatingWorkerBindings } from '../types';

export type { Sql };

export const createDb = (bindings: SeatingWorkerBindings): Sql =>
  createSql({ HYPERDRIVE: bindings.HYPERDRIVE });
