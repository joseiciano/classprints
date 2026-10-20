import { z } from '@hono/zod-openapi';

export const SESSION_COOKIE_SECURITY_SCHEME = 'cookieAuth';
export const CSRF_SECURITY_SCHEME = 'csrfToken';

export const ErrorResponseSchema = z.object({ error: z.string() }).openapi('ErrorResponse');

/** Declares a JSON response body for `createRoute` responses. */
export const jsonContent = <T extends z.ZodTypeAny>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});

/** Standard error responses for routes behind `requireAuth`. */
export const authErrorResponses = {
  401: jsonContent(ErrorResponseSchema, 'Missing or expired session'),
} as const;

export const sessionSecurity = [{ [SESSION_COOKIE_SECURITY_SCHEME]: [] }];

/** POST/PUT/PATCH/DELETE behind `requireCsrf` also need the CSRF header. */
export const mutatingSecurity = [
  { [SESSION_COOKIE_SECURITY_SCHEME]: [], [CSRF_SECURITY_SCHEME]: [] },
];

export const csrfErrorResponses = {
  403: jsonContent(
    ErrorResponseSchema.extend({ code: z.literal('CSRF_INVALID').optional() }),
    'Missing or mismatched CSRF token',
  ),
} as const;
