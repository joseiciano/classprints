import type { AnalyticsEngineDataset, Hyperdrive } from '@cloudflare/workers-types';
import type {
  JobStatus,
  JobStatusMetadata,
  SeatingJob,
  SeatingResult,
} from '@classprints/seating-shared';

export type { JobStatus, JobStatusMetadata, SeatingResult };
export type JobRecord = SeatingJob;

export interface EmailWorkerBindings {
  HYPERDRIVE: Hyperdrive;
  ANALYTICS?: AnalyticsEngineDataset;
  RESEND_FROM_EMAIL: string;
  RESEND_API_KEY?: string;
}
