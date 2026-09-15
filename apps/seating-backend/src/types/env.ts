import type { AnalyticsEngineDataset, Hyperdrive, Queue, RateLimit } from '@cloudflare/workers-types';
import type { SeatingJobQueueMessage } from '@classprints/seating-shared';

export interface SeatingWorkerBindings {
  [key: string]: unknown;
  ENVIRONMENT: string;
  APPLICATION_NAME: string;
  FRONTEND_URL: string;
  ALLOWED_ORIGINS: string;
  BASE_PATH?: string;
  HYPERDRIVE: Hyperdrive;
  BETTER_AUTH_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_PLUS_MONTHLY: string;
  STRIPE_PRICE_PLUS_QUARTERLY: string;
  STRIPE_PRICE_PLUS_ANNUAL: string;
  STRIPE_CHECKOUT_SUCCESS_URL: string;
  STRIPE_CHECKOUT_CANCEL_URL: string;
  STRIPE_PORTAL_RETURN_URL: string;
  API_RATELIMITER?: RateLimit;
  SEATING_JOBS: Queue<SeatingJobQueueMessage>;
  ANALYTICS?: AnalyticsEngineDataset;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
}

export interface UserVariables {
  user: { id: string; email: string | null };
}

export type SeatingHonoEnv = { Bindings: SeatingWorkerBindings; Variables: UserVariables };
