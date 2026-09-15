import { createSql, type Sql } from '@classprints/server/db';
import type { EmailWorkerBindings } from '../types';

export type { Sql };

export const createDb = (bindings: EmailWorkerBindings): Sql =>
  createSql({ HYPERDRIVE: bindings.HYPERDRIVE });
