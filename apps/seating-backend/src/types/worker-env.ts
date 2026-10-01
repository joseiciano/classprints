/**
 * Platform bindings (TASK-005): redeclares the `Cloudflare.Env` shape from
 * the `wrangler types` output (`worker-configuration.d.ts`) as a global
 * augmentation so this module composes the generated bindings with Hono
 * variables instead of adding unverified handwritten platform types.
 * Secrets and optional runtime-only bindings (EMAIL, API_RATELIMITER,
 * ANALYTICS) stay optional here.
 */
import type {
  AnalyticsEngineDataset,
  Hyperdrive,
  ImagesBinding,
  Queue,
  RateLimit,
  R2Bucket,
  SendEmail,
} from '@cloudflare/workers-types';

declare global {
  // Ambient namespace merge is the documented composition surface for
  // `wrangler types` output; a module export would defeat it.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cloudflare {
    interface Env {
      HYPERDRIVE: Hyperdrive;
      ASSIGNMENT_IMAGES: R2Bucket;
      TRANSCRIPTION_JOBS: Queue<unknown>;
      DOCUMENT_CLEANUP_JOBS: Queue<unknown>;
      IMAGES: ImagesBinding;
      API_RATELIMITER?: RateLimit;
      ANALYTICS?: AnalyticsEngineDataset;
      SEATING_JOBS: Queue<unknown>;
      EMAIL: SendEmail;
    }
  }
}

export type CloudflareEnv = Pick<
  Cloudflare.Env,
  | 'HYPERDRIVE'
  | 'ASSIGNMENT_IMAGES'
  | 'TRANSCRIPTION_JOBS'
  | 'DOCUMENT_CLEANUP_JOBS'
  | 'IMAGES'
  | 'API_RATELIMITER'
  | 'ANALYTICS'
  | 'SEATING_JOBS'
  | 'EMAIL'
>;
/** Re-parameterizes the generated queue binding with the app's message type. */
export type QueueFrom<Message> = Omit<Cloudflare.Env['SEATING_JOBS'], keyof symbol> & {
  send(message: Message): Promise<void>;
  sendBatch(messages: Message[]): Promise<void>;
};
