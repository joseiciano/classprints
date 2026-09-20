import type { Context, Hono, MiddlewareHandler } from 'hono';
import { HttpError } from '../../http';
import type { Sql } from '../../db/sql';
import { createAuth, type Auth, type BetterAuthConfig } from './auth';
import { AuthService } from './auth-service';

export type AuthWaitUntil = (promise: Promise<unknown>) => void;

export interface AuthDeps<Bindings extends Record<string, unknown> = Record<string, unknown>> {
  sqlFactory: (bindings: Bindings) => Sql;
  createBetterAuthConfig: (
    env: Bindings,
    requestOrigin: string,
    waitUntil?: AuthWaitUntil,
  ) => BetterAuthConfig;
}

type AuthContext<
  Bindings extends Record<string, unknown>,
  Variables extends object = Record<string, never>,
> = Context<{
  Bindings: Bindings;
  Variables: Variables;
}>;
type AuthEnv<
  Bindings extends Record<string, unknown>,
  Variables extends object = Record<string, never>,
> = {
  Bindings: Bindings;
  Variables: Variables;
};

export const createAuthServiceFor = <Bindings extends Record<string, unknown>>(
  deps: AuthDeps<Bindings>,
  env: Bindings,
  requestOrigin: string,
  waitUntil?: AuthWaitUntil,
): AuthService => {
  const sql = deps.sqlFactory(env);
  return new AuthService(
    createAuth(sql, deps.createBetterAuthConfig(env, requestOrigin, waitUntil)),
    sql,
  );
};

const createAuthFor = <Bindings extends Record<string, unknown>>(
  deps: AuthDeps<Bindings>,

  env: Bindings,
  requestOrigin: string,
  waitUntil?: AuthWaitUntil,
): Auth => {
  const sql = deps.sqlFactory(env);
  return createAuth(sql, deps.createBetterAuthConfig(env, requestOrigin, waitUntil));
};
/** Post-verification redirect target: the sign-in page can show a success
 * notice if automatic session restoration is unavailable in this browser. */
const frontendCallbackOf = (env: Record<string, unknown>): string => {
  const frontendUrl = (env as { FRONTEND_URL?: unknown }).FRONTEND_URL;
  if (typeof frontendUrl !== 'string') return '/';
  return new URL('/sign-in?verified=true', frontendUrl).toString();
};

const requestOriginOf = (c: { req: { url: string } }): string => new URL(c.req.url).origin;

const requestWaitUntilOf =
  <Bindings extends Record<string, unknown>, Variables extends object>(
    c: AuthContext<Bindings, Variables>,
  ): AuthWaitUntil =>
  (promise) =>
    c.executionCtx.waitUntil(promise);

/** Merges the cookies Better Auth issued into the request headers so a
 * follow-up session read observes the freshly created session. Pairs are
 * merged into a single cookie header (later values win): appending a second
 * `cookie` header would make `headers.get('cookie')` join the values with a
 * comma and break the session token lookup. */
const headersWithCookies = (request: Headers, authResponse: Response): Headers => {
  const cookies = new Map<string, string>();
  const readPairs = (header: string): void => {
    for (const pair of header.split(';')) {
      const separator = pair.indexOf('=');
      if (separator > 0) {
        cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
      }
    }
  };
  const existingCookie = request.get('cookie');
  if (existingCookie) {
    readPairs(existingCookie);
  }
  for (const setCookie of authResponse.headers.getSetCookie()) {
    readPairs(setCookie.split(';')[0] ?? '');
  }
  const headers = new Headers(request);
  headers.set('cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '));
  return headers;
};

/** Copies Better Auth's Set-Cookie headers onto the API response so the
 * browser actually receives the session (or its cleared state). */
const withAuthCookies = (response: Response, authResponse: Response): Response => {
  for (const cookie of authResponse.headers.getSetCookie()) {
    response.headers.append('set-cookie', cookie);
  }
  return response;
};

/** Marker cookie the shared auth client checks before hydrating the session
 * on page load (see `areTokensAvailable` in @classprints/shared). */
const CSRF_COOKIE = 'seating_csrf_token';

const withSessionMarkerCookie = (response: Response): Response =>
  withAuthCookies(
    response,
    Response.json(null, {
      headers: {
        'set-cookie': `${CSRF_COOKIE}=${crypto.randomUUID()}; Max-Age=604800; Path=/; Secure; SameSite=Lax`,
      },
    }),
  );

const withoutSessionMarkerCookie = (response: Response): Response =>
  withAuthCookies(
    response,
    Response.json(null, {
      headers: {
        'set-cookie': `${CSRF_COOKIE}=; Max-Age=0; Path=/; Secure; SameSite=Lax`,
      },
    }),
  );

export const registerAuthController = <
  Bindings extends Record<string, unknown>,
  Variables extends object = Record<string, never>,
>(
  app: Hono<AuthEnv<Bindings, Variables>>,
  deps: AuthDeps<Bindings>,
  rateLimitMiddlewareFactory?: () => MiddlewareHandler<any>,
): void => {
  const registerPost = (
    path: string,
    handler: (c: AuthContext<Bindings, Variables>) => Promise<Response>,
    rateLimited?: boolean,
  ) => {
    const middleware =
      rateLimited && rateLimitMiddlewareFactory ? rateLimitMiddlewareFactory() : undefined;

    const routeHandler: MiddlewareHandler<AuthEnv<Bindings, Variables>> = async (c) => {
      const response = await handler(c as AuthContext<Bindings, Variables>);
      return response;
    };

    if (middleware) {
      app.post(path, middleware, routeHandler);
    } else {
      app.post(path, routeHandler);
    }
  };

  // Legacy-style app endpoints that proxy to Better Auth server-side.
  registerPost(
    '/auth/sign-up',
    async (c) => {
      let rawBody: unknown;
      try {
        rawBody = await c.req.json();
      } catch {
        throw new HttpError(400, 'Invalid JSON body');
      }

      const body = rawBody as {
        email?: string;
        password?: string;
        displayName?: string;
      };
      if (!body.email || !body.password) {
        throw new HttpError(400, 'Email and password are required');
      }

      const service = createAuthServiceFor(deps, c.env, requestOriginOf(c), requestWaitUntilOf(c));
      await service.signUpEmail({
        email: body.email,
        password: body.password,
        name: body.displayName || body.email.split('@')[0],
        displayName: body.displayName,
        callbackUrl: frontendCallbackOf(c.env),
      });

      // Sign in immediately after sign-up so the caller gets session cookies.
      const signInResponse = await service.signInEmail({
        email: body.email,
        password: body.password,
        headers: c.req.raw.headers,
      });

      const session = await service.getSession(
        headersWithCookies(c.req.raw.headers, signInResponse),
      );
      if (!session) {
        throw new HttpError(500, 'Failed to create account');
      }

      return withSessionMarkerCookie(
        withAuthCookies(
          c.json(
            {
              user: {
                id: session.user.id,
                email: session.user.email,
                displayName: session.user.displayName,
              },
            },
            201,
          ),
          signInResponse,
        ),
      );
    },
    true,
  );

  registerPost(
    '/auth/sign-in',
    async (c) => {
      let rawBody: unknown;
      try {
        rawBody = await c.req.json();
      } catch {
        throw new HttpError(400, 'Invalid JSON body');
      }

      const body = rawBody as { email?: string; password?: string; remember?: boolean };
      if (!body.email || !body.password) {
        throw new HttpError(400, 'Email and password are required');
      }

      const service = createAuthServiceFor(deps, c.env, requestOriginOf(c), requestWaitUntilOf(c));
      const signInResponse = await service.signInEmail({
        email: body.email,
        password: body.password,
        remember: body.remember ?? true,
        headers: c.req.raw.headers,
      });

      const session = await service.getSession(
        headersWithCookies(c.req.raw.headers, signInResponse),
      );
      if (!session) {
        throw new HttpError(500, 'Failed to create session');
      }

      return withSessionMarkerCookie(
        withAuthCookies(c.json({ user: session.user }, 200), signInResponse),
      );
    },
    true,
  );

  registerPost('/auth/sign-out', async (c) => {
    const service = createAuthServiceFor(deps, c.env, requestOriginOf(c), requestWaitUntilOf(c));
    const signOutResponse = await service.signOut(c.req.raw.headers);
    return withoutSessionMarkerCookie(withAuthCookies(c.body(null, 204), signOutResponse));
  });
  registerPost('/auth/exchange-tokens', async (c) => {
    // Session rollover is handled by Better Auth via its own cookie lifecycle;
    // this endpoint returns the current session or 401 if absent.
    const service = createAuthServiceFor(deps, c.env, requestOriginOf(c), requestWaitUntilOf(c));
    const session = await service.getSession(c.req.raw.headers);
    if (!session) {
      throw new HttpError(401, 'Session expired. Please sign in again.');
    }
    return c.json({ user: session.user }, 200);
  });
  app.get('/auth/session', async (c: AuthContext<Bindings, Variables>) => {
    const service = createAuthServiceFor(deps, c.env, requestOriginOf(c), requestWaitUntilOf(c));
    const session = await service.getSession(c.req.raw.headers);
    if (!session) {
      return c.json({ user: null }, 200);
    }
    return c.json({ user: session.user }, 200);
  });

  registerPost(
    '/auth/resend-verification',
    async (c) => {
      let rawBody: unknown;
      try {
        rawBody = await c.req.json();
      } catch {
        throw new HttpError(400, 'Invalid JSON body');
      }

      const body = rawBody as { email?: string };
      if (!body.email) {
        throw new HttpError(400, 'Email is required');
      }

      const service = createAuthServiceFor(deps, c.env, requestOriginOf(c), requestWaitUntilOf(c));
      await service.resendVerificationEmail(body.email, frontendCallbackOf(c.env));
      return c.body(null, 204);
    },
    true,
  );

  // Mount the Better Auth handler itself for native endpoints (email
  // verification callbacks, password reset, etc.) under its own base path.
  app.all('/auth/better-auth/*', async (c: AuthContext<Bindings, Variables>) => {
    const auth = createAuthFor(deps, c.env, requestOriginOf(c), requestWaitUntilOf(c));
    return auth.handler(c.req.raw);
  });
};
