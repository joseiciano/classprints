import { createSql, type Sql } from '@classprints/server/db';
import type { AssignmentWorkerBindings } from '../types';

export type { Sql };

export const createDb = (bindings: AssignmentWorkerBindings): Sql =>
  createSql({ HYPERDRIVE: bindings.HYPERDRIVE });
