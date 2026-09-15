import type { AnalyticsEngineDataset } from '@cloudflare/workers-types';

export class Metrics {
  constructor(private readonly dataset?: AnalyticsEngineDataset) {}

  trackWorkerIteration(jobId: string, generation: number, durationMs: number) {
    this.dataset?.writeDataPoint({
      indexes: ['worker_iteration'],
      blobs: [jobId],
      doubles: [generation, durationMs, Date.now()],
    });
  }

  trackJobCompleted(
    jobId: string,
    status: 'completed' | 'failed',
    processingTimeMs: number,
    resultsCount: number,
  ) {
    this.dataset?.writeDataPoint({
      indexes: ['job_completed'],
      blobs: [jobId, status],
      doubles: [processingTimeMs, resultsCount, Date.now()],
    });
  }

  trackArrangementSaved(jobId: string, fitnessScore: number, isDuplicate: boolean) {
    this.dataset?.writeDataPoint({
      indexes: ['arrangement_saved'],
      blobs: [jobId, isDuplicate ? 'duplicate' : 'unique'],
      doubles: [fitnessScore, Date.now()],
    });
  }
}
