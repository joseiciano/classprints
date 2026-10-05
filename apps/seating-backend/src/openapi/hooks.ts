import type { Hook } from '@hono/zod-openapi';
import { HttpError } from '../lib/http-error';
import type { SeatingHonoEnv } from '../types/env';

/** Keeps the API's `{ error: message }` shape for request validation failures. */
export const validationHook: Hook<unknown, SeatingHonoEnv, string, unknown> = (result) => {
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new HttpError(400, issue?.message ?? 'Invalid request body');
  }
};
