import type { AnalyticsEngineDataset, Hyperdrive } from '@cloudflare/workers-types';
import type { EmailBinding } from '@classprints/server/email';
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
  EMAIL: EmailBinding;
  EMAIL_FROM_ADDRESS: string;
  EMAIL_FROM_NAME: string;
}
