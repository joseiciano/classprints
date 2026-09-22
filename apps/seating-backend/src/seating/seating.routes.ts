import { Hono } from 'hono';
import type { Context } from 'hono';
import type { SeatingJobQueueMessage } from '@classprints/seating-shared';
import { ZodError } from 'zod';
import { createSeatingConfigSchema, updateSeatingConfigSchema } from '@classprints/seating-shared';
import { Metrics } from '../utils/metrics';
import { createDb } from '../lib/db';
import { createSeatingRepository } from './seating.db';
import { SeatingService, SeatingConfigService } from './seating.service';
import type { SeatingHonoEnv, SeatingWorkerBindings } from '../types/env';
import type { AuthenticatedUser } from '@classprints/server/auth';
import { BillingService, type BillingServiceConfig } from '@classprints/server/billing';
import { isHttpError } from '../lib/http-error';

const IS_LLM_ENABLED = true;

const getUser = (c: Context<SeatingHonoEnv>): AuthenticatedUser => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (c as any).get('user') as AuthenticatedUser;
};

export const registerSeatingRoutes = (app: Hono<SeatingHonoEnv>) => {
  app.post('/seating', async (c) => {
    try {
      const user = getUser(c);
      const payload = await c.req.json();
      const service = createService(c);
      const { summary, isDuplicate } = await service.createJob(payload, user.id);
      const message = isDuplicate
        ? 'Identical seating job already exists; returning existing job metadata'
        : 'Seating job created and queued for processing';
      return c.json({ message, data: summary }, isDuplicate ? 200 : 202);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.post('/seating/llm', async (c) => {
    if (!IS_LLM_ENABLED) {
      return c.json({ error: 'LLM-powered seating is currently disabled' }, 403);
    }

    try {
      const user = getUser(c);
      const payload = await c.req.json();
      const service = createService(c);
      const { summary, isDuplicate } = await service.createJob(
        {
          ...(typeof payload === 'object' && payload ? payload : {}),
          algorithm: 'llm',
        },
        user.id,
      );
      const message = isDuplicate
        ? 'Identical LLM seating job already exists; returning existing job metadata'
        : 'LLM seating job created and queued for processing';
      return c.json({ message, data: summary }, isDuplicate ? 200 : 202);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.get('/seating', async (c) => {
    try {
      const user = getUser(c);
      const limitParam = Number.parseInt(c.req.query('limit') ?? '20', 10);
      const limit = Number.isNaN(limitParam) ? 20 : limitParam;
      const service = createService(c);
      const jobs = await service.listJobs(user.id, limit);
      return c.json({ data: jobs }, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  // Config routes (must be registered before dynamic /:externalId routes)
  app.get('/seating/configs', async (c) => {
    try {
      const limitParam = Number.parseInt(c.req.query('limit') ?? '100', 10);
      const limit = Number.isNaN(limitParam) ? 100 : limitParam;
      const user = getUser(c);
      const service = createConfigService(c);
      const configs = await service.listConfigs(user.id, limit);
      return c.json({ data: configs }, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.post('/seating/configs', async (c) => {
    try {
      const user = getUser(c);
      const payload = await c.req.json();
      const validated = createSeatingConfigSchema.parse(payload);
      const service = createConfigService(c);
      const config = await service.createConfig(user.id, validated);
      return c.json({ data: config }, 201);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.get('/seating/configs/:id', async (c) => {
    try {
      const user = getUser(c);
      const configId = c.req.param('id');
      const service = createConfigService(c);
      const config = await service.getConfig(configId);
      if (!config) {
        return c.json({ error: 'Config not found' }, 404);
      }
      if (config.userId !== user.id) {
        return c.json({ error: 'Forbidden' }, 403);
      }
      return c.json({ data: config }, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.patch('/seating/configs/:id', async (c) => {
    try {
      const user = getUser(c);
      const configId = c.req.param('id');
      const payload = await c.req.json();
      const validated = updateSeatingConfigSchema.parse(payload);
      const service = createConfigService(c);
      const config = await service.updateConfig(configId, user.id, validated);
      if (!config) {
        return c.json({ error: 'Config not found' }, 404);
      }
      return c.json({ data: config }, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.delete('/seating/configs/:id', async (c) => {
    try {
      const user = getUser(c);
      const configId = c.req.param('id');
      const service = createConfigService(c);
      const deleted = await service.deleteConfig(configId, user.id);
      if (!deleted) {
        return c.json({ error: 'Config not found' }, 404);
      }
      return c.json({ message: 'Config deleted' }, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.get('/seating/:externalId', async (c) => {
    try {
      const service = createService(c);
      const job = await service.getJobStatus(c.req.param('externalId'));
      if (!job) {
        return c.json({ error: 'Job not found' }, 404);
      }
      return c.json(job, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.get('/seating/:externalId/summary', async (c) => {
    try {
      const service = createService(c);
      const summary = await service.getJobSummary(c.req.param('externalId'));
      if (!summary) {
        return c.json({ error: 'Job not found' }, 404);
      }
      return c.json({ data: summary }, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.get('/seating/:externalId/results', async (c) => {
    try {
      const user = getUser(c);
      const service = createService(c);
      const results = await service.getJobResults(c.req.param('externalId'), user.id);
      if (!results) {
        return c.json({ error: 'Job not found' }, 404);
      }
      return c.json(results, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });
};

const createBillingConfig = (env: SeatingWorkerBindings): BillingServiceConfig => {
  console.log('[DEBUG] Route Stripe Key Length:', env.STRIPE_SECRET_KEY?.length ?? 0);
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
};

const createService = (c: Context<SeatingHonoEnv>) => {
  const sql = createDb(c.env);
  const repo = createSeatingRepository(sql);
  const queue = {
    send: async (message: SeatingJobQueueMessage) => {
      await c.env.SEATING_JOBS.send(message);
    },
  };
  const billing = new BillingService(sql, createBillingConfig(c.env));
  const analytics = new Metrics(c.env.ANALYTICS);
  return new SeatingService({ repo, queue, billing, analytics });
};

const createConfigService = (c: Context<SeatingHonoEnv>) => {
  const sql = createDb(c.env);
  const billing = new BillingService(sql, createBillingConfig(c.env));
  return SeatingConfigService.fromBindings({ sql, billing });
};

const handleRouteError = (error: unknown, c: Context<SeatingHonoEnv>) => {
  if (error instanceof ZodError) {
    return c.json(
      {
        error: 'Validation failed',
        details: error.issues.map((issue) => ({
          path: issue.path.join('.') || issue.path,
          message: issue.message,
        })),
      },
      400,
    );
  }

  if (isHttpError(error)) {
    return c.json({ error: error.message }, error.status);
  }

  if (error instanceof SyntaxError) {
    return c.json({ error: 'Invalid JSON payload' }, 400);
  }

  console.error('Unhandled seating route error', error);
  return c.json({ error: 'Internal Server Error' }, 500);
};
