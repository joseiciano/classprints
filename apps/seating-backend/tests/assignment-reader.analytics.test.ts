import { describe, expect, it, vi } from 'vitest';
import {
  AssignmentReaderError,
  AssignmentReaderService,
  type AssignmentAnalyticsClient,
} from '../src/assignment-reader/assignment-reader.service';
import type { AssignmentReaderRepository } from '../src/assignment-reader/assignment-reader.repository';
import type { DocumentStatusRow } from '../src/assignment-reader/assignment-reader.types';

/**
 * TASK-027: `recordAnalyticsEvent` ownership and dispatch. A `Proxy` fake
 * repository stands in for the ~50-method `AssignmentReaderRepository`
 * interface, throwing if this test ever touches a method besides
 * `findDocumentStatus` — the only one `recordAnalyticsEvent` calls.
 */

const TEACHER_A = '11111111-1111-1111-1111-111111111111';
const TEACHER_B = '22222222-2222-2222-2222-222222222222';
const SUBMISSION_1 = 'bbbbbbbb-0000-4000-8000-000000000001';

const docRow: DocumentStatusRow = {
  document_type: 'submission',
  document_id: SUBMISSION_1,
  document_revision: 1,
  draft_confirmed: true,
  class_id: 'cccccccc-0000-4000-8000-000000000001',
  assignment_id: 'dddddddd-0000-4000-8000-000000000001',
  student_id: 'eeeeeeee-0000-4000-8000-000000000001',
  class_status: 'active',
  student_name: 'Student One',
  lifecycle: null,
};

const fakeRepo = (): AssignmentReaderRepository =>
  new Proxy(
    {
      async findDocumentStatus(teacherId: string, documentType: 'materials' | 'submission', documentId: string) {
        if (documentType !== 'submission' || documentId !== SUBMISSION_1) return null;
        return teacherId === TEACHER_A ? docRow : null;
      },
    },
    {
      get(target, prop, receiver) {
        if (prop in target) return Reflect.get(target, prop, receiver);
        return () => {
          throw new Error(`fake repository: ${String(prop)} is not used by this test`);
        };
      },
    },
  ) as unknown as AssignmentReaderRepository;

const fakeAnalytics = (): AssignmentAnalyticsClient & {
  calls: Array<{ method: string; args: unknown[] }>;
} => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  return {
    calls,
    trackReviewSessionStart: vi.fn((...args) => calls.push({ method: 'trackReviewSessionStart', args })),
    trackReviewSessionEnd: vi.fn((...args) => calls.push({ method: 'trackReviewSessionEnd', args })),
    trackMaterialsOpen: vi.fn((...args) => calls.push({ method: 'trackMaterialsOpen', args })),
  };
};

describe('AssignmentReaderService.recordAnalyticsEvent (TASK-027)', () => {
  it('throws 404 for a foreign-owned document (SEC-001: not 403)', async () => {
    const analytics = fakeAnalytics();
    const service = new AssignmentReaderService({ repo: fakeRepo(), analytics });

    await expect(
      service.recordAnalyticsEvent(TEACHER_B, 'submission', SUBMISSION_1, { type: 'review_session_start' }),
    ).rejects.toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' } satisfies Partial<AssignmentReaderError>);
    expect(analytics.calls).toHaveLength(0);
  });

  it('throws 404 for an unknown document id', async () => {
    const analytics = fakeAnalytics();
    const service = new AssignmentReaderService({ repo: fakeRepo(), analytics });

    await expect(
      service.recordAnalyticsEvent(TEACHER_A, 'submission', 'ffffffff-0000-4000-8000-000000000099', {
        type: 'materials_open',
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('dispatches review_session_start without a duration', async () => {
    const analytics = fakeAnalytics();
    const service = new AssignmentReaderService({ repo: fakeRepo(), analytics });

    await service.recordAnalyticsEvent(TEACHER_A, 'submission', SUBMISSION_1, { type: 'review_session_start' });

    expect(analytics.calls).toEqual([{ method: 'trackReviewSessionStart', args: ['submission'] }]);
  });

  it('dispatches review_session_end with the reported duration', async () => {
    const analytics = fakeAnalytics();
    const service = new AssignmentReaderService({ repo: fakeRepo(), analytics });

    await service.recordAnalyticsEvent(TEACHER_A, 'submission', SUBMISSION_1, {
      type: 'review_session_end',
      durationMs: 45_000,
    });

    expect(analytics.calls).toEqual([{ method: 'trackReviewSessionEnd', args: ['submission', 45_000] }]);
  });

  it('dispatches materials_open', async () => {
    const analytics = fakeAnalytics();
    const service = new AssignmentReaderService({ repo: fakeRepo(), analytics });

    await service.recordAnalyticsEvent(TEACHER_A, 'submission', SUBMISSION_1, { type: 'materials_open' });

    expect(analytics.calls).toEqual([{ method: 'trackMaterialsOpen', args: [] }]);
  });

  it('never throws when no analytics client is configured', async () => {
    const service = new AssignmentReaderService({ repo: fakeRepo() });

    await expect(
      service.recordAnalyticsEvent(TEACHER_A, 'submission', SUBMISSION_1, { type: 'review_session_start' }),
    ).resolves.toBeUndefined();
  });
});
