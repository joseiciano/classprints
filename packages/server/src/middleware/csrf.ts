import type { MiddlewareHandler } from 'hono';

/**
 * Double-submit CSRF protection (api-manifest.md §1.1: every state-changing
 * request must include the CSRF header and token).
 *
 * The auth controller plants the `seating_csrf_token` cookie at sign-in;
 * the browser echoes it in the `X-CSRF-Token` header on every mutating
 * request. The middleware requires an exact cookie/header match on
 * POST/PUT/PATCH/DELETE. GET/HEAD/OPTIONS are exempt.
 *
 * Per-route cookies are not supported; the cookie name is fixed to match
 * `packages/server/src/auth/better-auth/auth-controller.ts`.
 */
const CSRF_COOKIE = 'seating_csrf_token';
const CSRF_HEADER = 'X-CSRF-Token';

const readCookie = (header: string | undefined, name: string): string | null => {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [rawName, ...rest] = part.split('=');
    if (rawName?.trim() === name) {
      return rest.join('=').trim() || null;
    }
  }
  return null;
};

export const requireCsrf = (): MiddlewareHandler =>
  async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return next();
    }
    const cookieToken = readCookie(c.req.header('cookie'), CSRF_COOKIE);
    const headerToken = c.req.header(CSRF_HEADER);
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      return c.json(
        {
          error: 'Missing or invalid CSRF token. Refresh the page and try again.',
          code: 'CSRF_INVALID',
        },
        403,
      );
    }
    return next();
  };
