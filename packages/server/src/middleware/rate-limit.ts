import { cloudflareRateLimiter } from '@hono-rate-limiter/cloudflare';
import type { RateLimit } from '@cloudflare/workers-types';
import type { Context, MiddlewareHandler } from 'hono';
import { HttpError } from '../http/http-error';

export interface RateLimitBindings {
  ENVIRONMENT?: string;
  [key: string]: unknown;
}

const getClientIdentifier = (c: Context<{ Bindings: RateLimitBindings }>): string => {
  return (
    c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
    c.req.header('X-Real-IP') ||
    'unknown-client'
  );
};

const rateLimitHandler = (c: Context<{ Bindings: RateLimitBindings }>): Response => {
  throw new HttpError(429, 'Too many requests. Please try again later.', {
    retryAfter: 60,
    message: 'Rate limit exceeded',
  });
};

export interface CreateRateLimitOptions<
  E extends { Bindings: RateLimitBindings } = { Bindings: RateLimitBindings },
> {
  binding: (c: Context<E>) => RateLimit | undefined;
  bindingName: string;
}

export const createRateLimitMiddleware = <
  E extends { Bindings: RateLimitBindings } = { Bindings: RateLimitBindings },
>(
  options: CreateRateLimitOptions<E>,
): MiddlewareHandler<E> => {
  return async (c, next) => {
    const isLocalDev = c.env.ENVIRONMENT === 'development';
    const rateLimitBinding = options.binding(c);

    // If binding is missing, log a warning and continue
    if (!rateLimitBinding) {
      if (!isLocalDev) {
        console.error(
          `❌  Rate limiting binding "${options.bindingName}" is MISSING in production. Requests will not be throttled.`,
        );
      } else {
        console.warn(`⚠️  Rate limiting disabled: ${options.bindingName} binding missing`);
      }
      return next();
    }

    // Use Cloudflare rate limiter when binding exists
    return cloudflareRateLimiter<E>({
      rateLimitBinding: () => rateLimitBinding,
      keyGenerator: (c) =>
        getClientIdentifier(c as unknown as Context<{ Bindings: RateLimitBindings }>),
      handler: rateLimitHandler as unknown as (c: Context<E>) => Response | Promise<Response>,
    })(c, next);
  };
};
