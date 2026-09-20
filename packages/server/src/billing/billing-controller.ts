import type { Context, Hono, MiddlewareHandler } from 'hono';
import { HttpError } from '../http';
import type { Sql } from '../db/sql';
import type { AuthService } from '../auth/better-auth/auth-service';
import { authenticate } from '../auth/better-auth/middleware';
import { BillingService, type BillingServiceConfig } from './billing-service';
import { checkoutRequestSchema, portalRequestSchema } from './types';
import type { PlansResponse } from './types';

export interface BillingControllerOptions<
  Bindings extends Record<string, unknown> = Record<string, unknown>,
> {
  sqlFactory: (bindings: Bindings) => Sql;
  /** Returns the AuthService used to resolve the request user. */
  authServiceFactory?: (env: Bindings, requestOrigin: string) => AuthService;
  createService?: (sql: Sql, config: BillingServiceConfig) => BillingService;
  createBillingServiceConfig: (env: Bindings) => BillingServiceConfig;
  rateLimitMiddlewareFactory?: () => MiddlewareHandler<any>;
}

type BillingContext<Bindings extends Record<string, unknown>, Variables extends object = Record<string, never>> = Context<{
  Bindings: Bindings;
  Variables: Variables;
}>;
type BillingEnv<Bindings extends Record<string, unknown>, Variables extends object = Record<string, never>> = {
  Bindings: Bindings;
  Variables: Variables;
};

export const registerBillingRoutes = <
  Bindings extends Record<string, unknown>,
  Variables extends object = Record<string, never>,
>(
  app: Hono<BillingEnv<Bindings, Variables>>,
  options: BillingControllerOptions<Bindings>,
): void => {
  const registerPost = (
    path: string,
    handler: MiddlewareHandler<BillingEnv<Bindings, Variables>>,
    rateLimited?: boolean,
  ) => {
    if (rateLimited && options.rateLimitMiddlewareFactory) {
      app.post(path, options.rateLimitMiddlewareFactory(), handler);
    } else {
      app.post(path, handler);
    }
  };

  const authServiceOf = (env: Bindings, requestOrigin: string): AuthService => {
    if (!options.authServiceFactory) {
      throw new HttpError(500, 'AuthService factory is not configured');
    }
    return options.authServiceFactory(env, requestOrigin);
  };

  registerPost(
    '/billing/checkout',
    async (c: BillingContext<Bindings, Variables>) => {
      const user = await authenticate(
        { authService: authServiceOf(c.env, new URL(c.req.url).origin) },
        c.req.raw.headers,
      );

      let rawBody: unknown;
      try {
        rawBody = await c.req.json();
      } catch {
        throw new HttpError(400, 'Invalid JSON body');
      }

      const parsed = checkoutRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new HttpError(400, issue?.message ?? 'Invalid request body');
      }

      const config = options.createBillingServiceConfig(c.env);
      const service = (options.createService ?? ((sql, cfg) => new BillingService(sql, cfg)))(
        options.sqlFactory(c.env),
        config,
      );

      const url = await service.createCheckoutSession(
        user.id,
        parsed.data.plan as 'plus_monthly' | 'plus_quarterly' | 'plus_annual',
        config.checkoutSuccessUrl,
        config.checkoutCancelUrl,
      );

      return c.json({ url }, 200);
    },
    true,
  );

  registerPost(
    '/billing/portal',
    async (c: BillingContext<Bindings, Variables>) => {
      const user = await authenticate(
        { authService: authServiceOf(c.env, new URL(c.req.url).origin) },
        c.req.raw.headers,
      );

      let rawBody: unknown = {};
      if (c.req.header('content-type')?.includes('application/json')) {
        try {
          rawBody = await c.req.json();
        } catch {
          throw new HttpError(400, 'Invalid JSON body');
        }
      }

      const parsed = portalRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new HttpError(400, issue?.message ?? 'Invalid request body');
      }

      const config = options.createBillingServiceConfig(c.env);
      const service = (options.createService ?? ((sql, cfg) => new BillingService(sql, cfg)))(
        options.sqlFactory(c.env),
        config,
      );

      const returnUrl = parsed.data.returnUrl ?? config.portalReturnUrl;
      const url = await service.createPortalSession(user.id, returnUrl);
      return c.json({ url }, 200);
    },
    true,
  );

  app.get('/billing/subscription', async (c: BillingContext<Bindings, Variables>) => {
    const user = await authenticate(
      { authService: authServiceOf(c.env, new URL(c.req.url).origin) },
      c.req.raw.headers,
    );

    const config = options.createBillingServiceConfig(c.env);
    const service = (options.createService ?? ((sql, cfg) => new BillingService(sql, cfg)))(
      options.sqlFactory(c.env),
      config,
    );

    const subscription = await service.getSubscription(user.id);
    return c.json(subscription, 200);
  });

  app.get('/billing/plans', async (c: BillingContext<Bindings, Variables>) => {
    const config = options.createBillingServiceConfig(c.env);
    const service = (options.createService ?? ((sql, cfg) => new BillingService(sql, cfg)))(
      options.sqlFactory(c.env),
      config,
    );

    const plans = service.getAvailablePlans();
    const response: PlansResponse = { plans };
    return c.json(response, 200);
  });

  app.post('/billing/webhook', async (c: BillingContext<Bindings, Variables>) => {
    const signature = c.req.header('Stripe-Signature') ?? c.req.header('stripe-signature');
    if (!signature) {
      throw new HttpError(400, 'Missing Stripe signature');
    }

    const rawBody = await c.req.arrayBuffer();
    const payload = new TextDecoder().decode(rawBody);

    const config = options.createBillingServiceConfig(c.env);
    const service = (options.createService ?? ((sql, cfg) => new BillingService(sql, cfg)))(
      options.sqlFactory(c.env),
      config,
    );

    await service.handleWebhookEvent(payload, signature);
    return c.json({ received: true }, 200);
  });
};
