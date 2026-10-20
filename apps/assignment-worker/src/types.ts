import type {
  AnalyticsEngineDataset,
  Hyperdrive,
  ImagesBinding,
  MessageBatch,
  Queue,
  R2Bucket,
} from '@cloudflare/workers-types';
import type { TranscriptionPageMessage } from '@classprints/assignment-reader-shared';

/**
 * Assignment worker bindings (TASK-006). The worker deploys as
 * `classprints-transcriber` and consumes both transcription and cleanup
 * queues; queue messages are the shared discriminated union.
 */
export interface AssignmentWorkerBindings {
  HYPERDRIVE: Hyperdrive;
  ASSIGNMENT_IMAGES: R2Bucket;
  IMAGES: ImagesBinding;
  ANALYTICS?: AnalyticsEngineDataset;
  LLM_API_KEY?: string;
  TRANSCRIPTION_MODEL: string;
  TRANSCRIPTION_FALLBACK_MODELS: string;
  /** 'true' when the operator-verified endpoint advertises native
   * structured-output support (REQ-024; provider-privacy-evidence.md §3). */
  TRANSCRIPTION_STRUCTURED_OUTPUTS?: string;
}

export type WorkerQueueMessage = unknown;

export interface WorkerEnv {
  Bindings: AssignmentWorkerBindings;
}

export type { TranscriptionPageMessage, MessageBatch, Queue };
