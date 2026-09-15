import type { Context, MiddlewareHandler } from 'hono';
import { HttpError } from '../../http';
import { createAuthServiceFor, type AuthDeps } from './auth-controller';
import type { Auth } from './auth';

export interface AuthenticatedUser {
  id: string;
  email: string | null;
}

const authenticateRequest = async (
  deps: { authService: { getSession(headers: Headers): Promise<{ user: { id: string; email: string | null } } | null> } },
  headers: Headers,
): Promise<AuthenticatedUser> => {
  const session = await deps.authService.getSession(headers);
  if (!session) {
    throw new HttpError(401, 'Invalid or expired access token');
  }
  return {
    id: session.user.id,
    email: session.user.email,
  };
};

export const authenticate = authenticateRequest;

export const optionalAuthenticateRequest = async (
  deps: Parameters<typeof authenticateRequest>[0],
  headers: Headers,
): Promise<AuthenticatedUser | null> => {
  try {
    return await authenticateRequest(deps, headers);
  } catch {
    return null;
  }
};

export const requireAuth = <Bindings extends Record<string, unknown>>(
  deps: AuthDeps<Bindings>,
): MiddlewareHandler<{ Bindings: Bindings; Variables: { user: AuthenticatedUser } }> =>
  async (c, next) => {
    const service = createAuthServiceFor(deps, c.env as Bindings);
    const user = await authenticateRequest({ authService: service }, c.req.raw.headers);
    c.set('user', user);
    await next();
  };

/**
 * Hono middleware: resolves the session when present; otherwise leaves the
 * request anonymous (user is null) instead of failing.
 */
export const optionalAuth = <Bindings extends Record<string, unknown>>(
  deps: AuthDeps<Bindings>,
): MiddlewareHandler<{ Bindings: Bindings; Variables: { user: AuthenticatedUser | null } }> =>
  async (c, next) => {
    const service = createAuthServiceFor(deps, c.env as Bindings);
    const user = await optionalAuthenticateRequest({ authService: service }, c.req.raw.headers);
    c.set('user', user);
    await next();
  };
