import type { Context, Hono, MiddlewareHandler } from 'hono';
import { HttpError } from '../../http';
import type { Sql } from '../../db/sql';
import { createAuth, type Auth, type BetterAuthConfig } from './auth';
import { AuthService } from './auth-service';

export interface AuthDeps<Bindings extends Record<string, unknown> = Record<string, unknown>> {
  sqlFactory: (bindings: Bindings) => Sql;
  createBetterAuthConfig: (env: Bindings) => BetterAuthConfig;
}

type AuthContext<Bindings extends Record<string, unknown>, Variables extends object = Record<string, never>> = Context<{
  Bindings: Bindings;
  Variables: Variables;
}>;
type AuthEnv<Bindings extends Record<string, unknown>, Variables extends object = Record<string, never>> = {
  Bindings: Bindings;
  Variables: Variables;
};

export const createAuthServiceFor = <Bindings extends Record<string, unknown>>(
  deps: AuthDeps<Bindings>,
  env: Bindings,
): AuthService => {
  const sql = deps.sqlFactory(env);
  return new AuthService(createAuth(sql, deps.createBetterAuthConfig(env)), sql);
};

const createAuthFor = <Bindings extends Record<string, unknown>>(
  deps: AuthDeps<Bindings>,
  env: Bindings,
): Auth => {
  const sql = deps.sqlFactory(env);
  return createAuth(sql, deps.createBetterAuthConfig(env));
};

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

      const service = createAuthServiceFor(deps, c.env);
      await service.signUpEmail({
        email: body.email,
        password: body.password,
        name: body.displayName || body.email.split('@')[0],
        displayName: body.displayName,
      });

      // Sign in immediately after sign-up so the caller has a session cookie.
      await service.signInEmail({
        email: body.email,
        password: body.password,
        headers: c.req.raw.headers,
      });

      const session = await service.getSession(c.req.raw.headers);
      if (!session) {
        throw new HttpError(500, 'Failed to create account');
      }

      return c.json(
        { user: { id: session.user.id, email: session.user.email, displayName: session.user.displayName } },
        201,
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

      const service = createAuthServiceFor(deps, c.env);
      await service.signInEmail({
        email: body.email,
        password: body.password,
        remember: body.remember ?? true,
        headers: c.req.raw.headers,
      });

      const session = await service.getSession(c.req.raw.headers);
      if (!session) {
        throw new HttpError(500, 'Failed to create session');
      }

      return c.json({ user: session.user }, 200);
    },
    true,
  );

  registerPost('/auth/sign-out', async (c) => {
    const service = createAuthServiceFor(deps, c.env);
    await service.signOut(c.req.raw.headers);
    return c.body(null, 204);
  });

  app.get('/auth/session', async (c: AuthContext<Bindings, Variables>) => {
    const service = createAuthServiceFor(deps, c.env);
    const session = await service.getSession(c.req.raw.headers);
    if (!session) {
      return c.json({ user: null }, 200);
    }
    return c.json({ user: session.user }, 200);
  });

  registerPost('/auth/exchange-tokens', async (c) => {
    // Session rollover is handled by Better Auth via its own cookie lifecycle;
    // this endpoint returns the current session or 401 if absent.
    const service = createAuthServiceFor(deps, c.env);
    const session = await service.getSession(c.req.raw.headers);
    if (!session) {
      clearSessionCookiesCompat();
      throw new HttpError(401, 'Session expired. Please sign in again.');
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

      const service = createAuthServiceFor(deps, c.env);
      await service.resendVerificationEmail(body.email);
      return c.body(null, 204);
    },
    true,
  );

  // Mount the Better Auth handler itself for native endpoints (email
  // verification callbacks, password reset, etc.) under its own base path.
  app.all('/auth/better-auth/*', async (c: AuthContext<Bindings, Variables>) => {
    const auth = createAuthFor(deps, c.env);
    return auth.handler(c.req.raw);
  });
};

function clearSessionCookiesCompat(): void {
  // No-op: Better Auth manages its own cookie clearing.
}
