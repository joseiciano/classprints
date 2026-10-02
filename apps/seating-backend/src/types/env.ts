import type { SeatingJobQueueMessage } from '@classprints/seating-shared';
import type {
  TranscriptionPageMessage,
  DeletionOperationMessage,
} from '@classprints/assignment-reader-shared';
import type { CloudflareEnv, QueueFrom } from './worker-env';

export interface SeatingWorkerBindings extends CloudflareEnv {
  [key: string]: unknown;
  ENVIRONMENT: string;
  APPLICATION_NAME: string;
  FRONTEND_URL: string;
  ALLOWED_ORIGINS: string;
  BASE_PATH?: string;
  BETTER_AUTH_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_PLUS_MONTHLY: string;
  STRIPE_PRICE_PLUS_QUARTERLY: string;
  STRIPE_PRICE_PLUS_ANNUAL: string;
  STRIPE_CHECKOUT_SUCCESS_URL: string;
  STRIPE_CHECKOUT_CANCEL_URL: string;
  STRIPE_PORTAL_RETURN_URL: string;
  SEATING_JOBS: QueueFrom<SeatingJobQueueMessage>;
  TRANSCRIPTION_JOBS: QueueFrom<TranscriptionPageMessage>;
  DOCUMENT_CLEANUP_JOBS: QueueFrom<DeletionOperationMessage>;
  EMAIL_FROM_ADDRESS: string;
  EMAIL_FROM_NAME: string;
}

export interface UserVariables {
  user: { id: string; email: string | null };
}

export type SeatingHonoEnv = { Bindings: SeatingWorkerBindings; Variables: UserVariables };
