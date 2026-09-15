import type { AnalyticsEngineDataset } from '@cloudflare/workers-types';

export class Metrics {
  constructor(private readonly dataset?: AnalyticsEngineDataset) {}

  trackEmailSent(jobId: string, success: boolean) {
    this.dataset?.writeDataPoint({
      indexes: ['email_sent'],
      blobs: [jobId, success ? 'success' : 'failed'],
      doubles: [Date.now()],
    });
  }
}
