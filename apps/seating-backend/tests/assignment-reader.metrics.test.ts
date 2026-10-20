import { describe, expect, it, vi } from 'vitest';
import type { AnalyticsEngineDataset, AnalyticsEngineDataPoint } from '@cloudflare/workers-types';
import { AssignmentReaderMetrics } from '../src/utils/metrics';

/**
 * TASK-027: the Analytics Engine write shape itself — every write must carry
 * only an event-type index and a document-type blob, never a page,
 * document, submission, or student/teacher id (SEC-003) — plus the
 * "metrics must never break a request" guarantee shared with `Metrics`.
 */

const fakeDataset = () => {
  const points: AnalyticsEngineDataPoint[] = [];
  const dataset: AnalyticsEngineDataset = {
    writeDataPoint: vi.fn((point: AnalyticsEngineDataPoint) => {
      points.push(point);
    }),
  };
  return { dataset, points };
};

describe('AssignmentReaderMetrics (TASK-027)', () => {
  it('writes review_session_start with only the document type, no ids', () => {
    const { dataset, points } = fakeDataset();
    new AssignmentReaderMetrics(dataset).trackReviewSessionStart('submission');

    expect(points).toHaveLength(1);
    expect(points[0].indexes).toEqual(['review_session_start']);
    expect(points[0].blobs).toEqual(['submission']);
  });

  it('writes review_session_end carrying the reported duration', () => {
    const { dataset, points } = fakeDataset();
    new AssignmentReaderMetrics(dataset).trackReviewSessionEnd('materials', 12_345);

    expect(points[0].indexes).toEqual(['review_session_end']);
    expect(points[0].blobs).toEqual(['materials']);
    expect(points[0].doubles?.[1]).toBe(12_345);
  });

  it('writes materials_open as a submission-scoped event', () => {
    const { dataset, points } = fakeDataset();
    new AssignmentReaderMetrics(dataset).trackMaterialsOpen();

    expect(points[0].indexes).toEqual(['materials_open']);
    expect(points[0].blobs).toEqual(['submission']);
  });

  it('is a no-op without a bound dataset', () => {
    expect(() => new AssignmentReaderMetrics(undefined).trackReviewSessionStart('submission')).not.toThrow();
  });

  it('swallows a dataset write failure rather than throwing', () => {
    const dataset: AnalyticsEngineDataset = {
      writeDataPoint: vi.fn(() => {
        throw new Error('Analytics Engine unavailable');
      }),
    };
    expect(() => new AssignmentReaderMetrics(dataset).trackMaterialsOpen()).not.toThrow();
  });
});
