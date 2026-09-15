import type { AnalyticsEngineDataset, Hyperdrive, Queue } from '@cloudflare/workers-types';
import type {
  ConflictMap,
  JobStatus,
  JobStatusMetadata,
  SeatingGrid,
  SeatingJob,
  SeatingJobQueueMessage,
  WorksWellWithMap,
  SeatContenders,
} from '@classprints/seating-shared';

export type {
  ConflictMap,
  JobStatus,
  JobStatusMetadata,
  SeatingGrid,
  WorksWellWithMap,
  SeatContenders,
};
export type AlgorithmRunMode = 'strict' | 'relaxed';
export type JobRecord = SeatingJob;

export interface JobStateRecord {
  jobId: string;
  currentGeneration: number;
  population: ArrayBuffer;
  bestFitness: number;
  reseeds: number;
  stagnantGenerations: number;
  mode: AlgorithmRunMode;
  updatedAt: number;
}

export interface JobWithState {
  job: JobRecord;
  state: JobStateRecord | null;
}

export interface SeatingWorkerBindings {
  HYPERDRIVE: Hyperdrive;
  EMAIL_JOBS: Queue<SeatingJobQueueMessage>;
  EMAIL_RESULTS_ENABLED?: string;
  LLM_API_KEY?: string;
  ANALYTICS?: AnalyticsEngineDataset;
}
