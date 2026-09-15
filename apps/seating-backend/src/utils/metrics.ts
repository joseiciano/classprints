import type { AnalyticsEngineDataset } from '@cloudflare/workers-types';
import type { AnalyticsClient } from '../seating/seating.service';

export class Metrics implements AnalyticsClient {
  constructor(private readonly dataset?: AnalyticsEngineDataset) {}

  trackJobCreated(jobId: string, studentCount: number, totalSeats: number) {
    this.dataset?.writeDataPoint({
      indexes: ['job_created'],
      blobs: [jobId],
      doubles: [studentCount, totalSeats, Date.now()],
    });
  }
}
