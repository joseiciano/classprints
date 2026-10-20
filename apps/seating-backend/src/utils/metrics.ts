import type { AnalyticsEngineDataset } from '@cloudflare/workers-types';
import type { DocumentType } from '@classprints/assignment-reader-shared';
import type { AnalyticsClient } from '../seating/seating.service';
import type { AssignmentAnalyticsClient } from '../assignment-reader/assignment-reader.service';

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

/** Assignment Reader review-session/materials-open instrumentation
 * (TASK-027). Writes carry an event-type index and a document-type blob
 * only — never a page/document/submission id, draft content, or
 * student/teacher name (SEC-003) — so a write here can never leak into a
 * cross-tenant identity even if the dataset were ever queried unscoped.
 * Metrics must never break a request: every write is best-effort. */
export class AssignmentReaderMetrics implements AssignmentAnalyticsClient {
  constructor(private readonly dataset?: AnalyticsEngineDataset) {}

  trackReviewSessionStart(documentType: DocumentType) {
    this.write('review_session_start', documentType);
  }

  trackReviewSessionEnd(documentType: DocumentType, durationMs: number) {
    this.write('review_session_end', documentType, durationMs);
  }

  trackMaterialsOpen() {
    this.write('materials_open', 'submission');
  }

  private write(eventType: string, documentType: DocumentType, durationMs?: number) {
    try {
      this.dataset?.writeDataPoint({
        indexes: [eventType],
        blobs: [documentType],
        doubles: [Date.now(), durationMs ?? -1],
      });
    } catch {
      // Metrics must never break the request.
    }
  }
}
