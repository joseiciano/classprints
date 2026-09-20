import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { SeatingHonoEnv, SeatingWorkerBindings } from './types/env';
import { registerSeatingRoutes } from './seating/seating.routes';
import { registerUserRoutes } from './user/user.routes';
import {
  registerAuthController,
  requireAuth,
  createAuthServiceFor,
  type AuthService,
  type AuthDeps,
} from '@classprints/server/auth';
import { registerBillingRoutes, type BillingServiceConfig } from '@classprints/server/billing';
import { getCsrfHeaderName } from '@classprints/shared';
import { createDb } from './lib/db';
import { EmailSender, renderVerificationTemplate } from '@classprints/server/email';
import { isHttpError } from '@classprints/server/http';
import { createRateLimitMiddleware } from '@classprints/server/middleware';
import type { ExecutionContext } from '@cloudflare/workers-types';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

type HonoEnv = SeatingHonoEnv;

export interface AppOptions {
  basePath?: string;
}

export const buildApp = (options: AppOptions = {}) => {
  const sqlFactory = (bindings: SeatingWorkerBindings) => createDb(bindings);

  const authDeps: AuthDeps<SeatingWorkerBindings> = {
    sqlFactory,
    createBetterAuthConfig: (env: SeatingWorkerBindings, requestOrigin: string, waitUntil) => {
      const allowedOrigins = (env.ALLOWED_ORIGINS || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

      const sendVerificationEmail = (input: { user: { email: string }; url: string }) => {
        const sender = new EmailSender(env.EMAIL, env.EMAIL_FROM_ADDRESS, env.EMAIL_FROM_NAME);
        const send = sender
          .send({
            to: input.user.email,
            subject: 'Verify Your Email - ClassPrints',
            html: renderVerificationTemplate({ verificationLink: input.url }),
            text: `Verify your ClassPrints email address: ${input.url}`,
          })
          .catch((error) => console.error('[auth] Failed to send verification email:', error));

        if (waitUntil) {
          waitUntil(send);
        } else {
          void send;
        }
      };

      return {
        secret: env.BETTER_AUTH_SECRET,
        baseUrl: requestOrigin,
        // Must equal the path `registerAuthController` mounts the Better Auth
        // handler at (`app.route('/api/v1', authApp)` + `/auth/better-auth/*`)
        // so email links resolve to the mounted handler.
        basePath: `${env.BASE_PATH ?? ''}/api/v1/auth/better-auth`,
        trustedOrigins: allowedOrigins.length > 0 ? allowedOrigins : [env.FRONTEND_URL],
        logger: console,
        sendVerificationEmail,
      };
    },
  };

  let app = new Hono<HonoEnv>();

  if (options.basePath) {
    app = app.basePath(options.basePath);
  }

  app.use('*', async (c, next) => {
    const allowedOrigins = (c.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (allowedOrigins.length === 0 && c.env.FRONTEND_URL) {
      allowedOrigins.push(c.env.FRONTEND_URL);
    }
    if (allowedOrigins.length === 0) {
      allowedOrigins.push(
        'http://localhost:5173',
        'http://localhost:5174',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
      );
    }
    const corsMiddleware = cors({
      origin: (origin) => {
        if (!origin) return allowedOrigins[0] ?? '*';
        return allowedOrigins.includes(origin) ? origin : allowedOrigins[0] ?? '*';
      },
      credentials: true,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', getCsrfHeaderName()],
    });
    return corsMiddleware(c, next);
  });

  app.onError((error, c) => {
    if (isHttpError(error)) {
      const status = error.status as ContentfulStatusCode;
      return c.json({ error: error.message }, status);
    }

    // Log the full error for debugging production issues
    console.error('Unhandled worker error:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      path: c.req.path,
      method: c.req.method,
    });

    return c.json(
      {
        error: 'Internal Server Error',
        message: error.message, // Temporarily include message for easier debugging
      },
      500,
    );
  });

  app.get('/health', (c) =>
    c.json({
      status: 'ok',
      service: c.env.APPLICATION_NAME || 'seating-backend',
      environment: c.env.ENVIRONMENT || 'development',
      timestamp: new Date().toISOString(),
    }),
  );

  app.get('/api/v1/metadata', (c) =>
    c.json({
      name: 'seating-backend',
      version: '0.1.0',
      description: 'Seating arrangement API',
    }),
  );

  // Shared rate limiter instance for this app
  const rateLimit = () =>
    createRateLimitMiddleware<HonoEnv>({
      binding: (c) => c.env.API_RATELIMITER,
      bindingName: 'API_RATELIMITER',
    });

  // Apply app-level rate limiting only when the binding exists.
  // Zone-level rate limiting can still protect routes when this binding is absent.
  const authServiceOf = (env: SeatingWorkerBindings, requestOrigin: string): AuthService =>
    createAuthServiceFor(authDeps, env, requestOrigin);

  const authApp = new Hono<HonoEnv>();
  registerAuthController(authApp, authDeps, rateLimit);
  app.route('/api/v1', authApp);

  const billingApp = new Hono<HonoEnv>();
  registerBillingRoutes(billingApp, {
    sqlFactory,
    authServiceFactory: authServiceOf,
    createBillingServiceConfig: (env: SeatingWorkerBindings): BillingServiceConfig => {
      return {
        stripeSecretKey: env.STRIPE_SECRET_KEY,
        stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
        checkoutSuccessUrl: env.STRIPE_CHECKOUT_SUCCESS_URL,
        checkoutCancelUrl: env.STRIPE_CHECKOUT_CANCEL_URL,
        portalReturnUrl: env.STRIPE_PORTAL_RETURN_URL,
        priceIds: {
          plusMonthly: env.STRIPE_PRICE_PLUS_MONTHLY,
          plusQuarterly: env.STRIPE_PRICE_PLUS_QUARTERLY,
          plusAnnual: env.STRIPE_PRICE_PLUS_ANNUAL,
        },
        logger: console,
      };
    },
    rateLimitMiddlewareFactory: rateLimit,
  });
  app.route('/api/v1', billingApp);

  const userApp = new Hono<HonoEnv>();
  userApp.use('*', requireAuth(authDeps));
  registerUserRoutes(userApp);
  app.route('/api/v1', userApp);

  const seatingApp = new Hono<HonoEnv>();
  seatingApp.use('/seating/*', requireAuth(authDeps));
  registerSeatingRoutes(seatingApp);
  app.route('/api/v1', seatingApp);

  return app;
};

let appInstance: ReturnType<typeof buildApp>;

export default {
  fetch: (request: Request, env: SeatingWorkerBindings, ctx: ExecutionContext) => {
    if (!appInstance) {
      appInstance = buildApp({ basePath: env.BASE_PATH });
    }
    return appInstance.fetch(request, env, ctx);
  },
};
