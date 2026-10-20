import { describe, expect, it } from 'vitest';
import {
  allSegmentsCurrentForPage,
  canRetranscribeDocument,
  computeAssignmentStatus,
  computeDocumentProcessingState,
  computeDocumentReviewState,
  computeProcessingCounts,
  canEditGradingDraft,
  canMarkGraded,
  canMarkReady,
  canReviewPage,
  decideReviewContextCapture,
  evaluateRetranscriptionConsent,
  formatScoreDisplay,
  gradingStateAfterDraftEdit,
  gradingStateAfterReturnToNeedsReview,
  isPageRetryEligible,
  reviewStateAfterDraftEdit,
  validateScore,
} from '../src/transitions';

const ALL_STATES = ['uploading', 'queued', 'transcribing', 'completed', 'failed'] as const;

describe('REQ-010 processing rollup precedence', () => {
  it.each([
    [['failed'], 'failed'],
    [['failed', 'completed'], 'failed'],
    [['uploading', 'failed'], 'failed'],
    [['uploading'], 'uploading'],
    [['uploading', 'transcribing'], 'uploading'],
    [['transcribing', 'queued'], 'transcribing'],
    [['queued'], 'queued'],
    [['queued', 'completed'], 'queued'],
    [['completed', 'completed'], 'completed'],
    [[], null],
  ] as Array<[typeof ALL_STATES[number][], string | null]>)(
    'rolls %j up to %j',
    (pageStates, expected) => {
      expect(computeDocumentProcessingState(pageStates)).toBe(expected);
    },
  );

  it('counts each state independently for mixed visibility', () => {
    const counts = computeProcessingCounts([
      'failed',
      'completed',
      'completed',
      'transcribing',
      'queued',
      'uploading',
    ]);
    expect(counts).toEqual({
      uploading: 1,
      queued: 1,
      transcribing: 1,
      completed: 2,
      failed: 1,
      total: 6,
    });
  });

  it('keeps total equal to the five-state sum', () => {
    const counts = computeProcessingCounts(ALL_STATES);
    expect(counts.total).toBe(
      counts.uploading + counts.queued + counts.transcribing + counts.completed + counts.failed,
    );
  });
});

describe('REQ-011/REQ-016 document review state', () => {
  const base = {
    draftConfirmed: true,
    pageStates: ['completed'] as Array<'completed'>,
    allPagesReviewed: false,
  };

  it.each([
        [true, ['completed', 'completed'], 'needs_review'],
    [true, ['completed', 'queued'], null],
    [true, ['failed'], null],
    [false, ['completed', 'completed'], null],
    [true, [], null],
  ] as Array<[boolean, string[], string | null]>)(
    'reviewState confirmed=%j states=%j -> %j',
    (draftConfirmed, pageStates, expected) => {
      expect(computeDocumentReviewState({ ...base, draftConfirmed, pageStates })).toBe(expected);
    },
  );

  it('readiness requires needs_review and every page reviewed', () => {
    expect(canMarkReady({ ...base, allPagesReviewed: true })).toBe(true);
    expect(canMarkReady({ ...base, allPagesReviewed: false })).toBe(false);
    expect(
      canMarkReady({ ...base, pageStates: ['completed', 'queued'], allPagesReviewed: true }),
    ).toBe(false);
    expect(canMarkReady({ ...base, draftConfirmed: false, allPagesReviewed: true })).toBe(false);
  });

  it('draft edit invalidates review by completion state', () => {
    expect(reviewStateAfterDraftEdit(['completed', 'completed'])).toBe('needs_review');
    expect(reviewStateAfterDraftEdit(['completed', 'transcribing'])).toBe(null);
    expect(reviewStateAfterDraftEdit([])).toBe(null);
  });
});

describe('REQ-016 page review transition', () => {
  const base = {
    documentReviewState: 'needs_review' as const,
    pageState: 'completed' as const,
    expectedContentRevision: 3,
    currentContentRevision: 3,
    isCurrentPage: true,
  };

  it('allows reviewing a current completed page at its current revision', () => {
    expect(canReviewPage(base)).toBe(true);
    expect(canReviewPage({ ...base, documentReviewState: null })).toBe(true);
  });

  it.each([
    ['stale revision', { expectedContentRevision: 2 }],
    ['superseded page', { isCurrentPage: false }],
    ['unfinished page', { pageState: 'queued' as const }],
    ['ready document', { documentReviewState: 'ready_to_grade' as const }],
  ])('rejects %s', (_name, patch) => {
    expect(canReviewPage({ ...base, ...patch })).toBe(false);
  });
});

describe('REQ-017/REQ-018 grading transitions', () => {
  it('mark graded requires ready_to_grade + not_graded + submission', () => {
    expect(canMarkGraded({ documentType: 'submission', reviewState: 'ready_to_grade', gradingState: 'not_graded' })).toBe(true);
    expect(canMarkGraded({ documentType: 'submission', reviewState: 'needs_review', gradingState: 'not_graded' })).toBe(false);
    expect(canMarkGraded({ documentType: 'submission', reviewState: 'ready_to_grade', gradingState: 'graded' })).toBe(false);
    expect(canMarkGraded({ documentType: 'materials', reviewState: 'ready_to_grade', gradingState: null })).toBe(false);
  });

  it('materials never carry a grading state', () => {
    expect(gradingStateAfterReturnToNeedsReview({ documentType: 'materials', reviewState: 'ready_to_grade', gradingState: null })).toBe(null);
    expect(gradingStateAfterReturnToNeedsReview({ documentType: 'submission', reviewState: 'ready_to_grade', gradingState: 'graded' })).toBe('not_graded');
  });

  it('draft grading edits work before readiness but not when graded', () => {
    expect(canEditGradingDraft({ documentType: 'submission', reviewState: 'needs_review', gradingState: 'not_graded' })).toBe(true);
    expect(canEditGradingDraft({ documentType: 'submission', reviewState: 'ready_to_grade', gradingState: 'not_graded' })).toBe(true);
    expect(canEditGradingDraft({ documentType: 'submission', reviewState: 'ready_to_grade', gradingState: 'graded' })).toBe(false);
    expect(canEditGradingDraft({ documentType: 'materials', reviewState: 'needs_review', gradingState: null })).toBe(false);
  });
});

describe('REQ-018 score validation', () => {
  it.each([
    [0, null, []],
    [8.5, 10, []],
    [10, 10, []],
    [0.01, null, []],
    [7.555, null, ['too_many_decimals']],
    [-1, null, ['negative']],
    [11, 10, ['exceeds_maximum']],
    [-0.5, 10, ['negative']],
    [8.125, 10, ['too_many_decimals']],
    [Number.NaN, null, ['not_finite']],
    [Number.POSITIVE_INFINITY, null, ['not_finite']],
    // Float-hostile doubles that the previous Math.round check rejected.
    [8.2, null, []],
    [8.2, 10, []],
    [0.07, null, []],
    [0.14, null, []],
    [0.29, null, []],
    [19.9, null, []],
    [9.6, null, []],
    [1.09, null, []],
    [0.1 + 0.2, null, []],
  ])('score %j max %j -> %j', (score, maxScore, expected) => {
    expect(validateScore({ score, maxScore })).toEqual(expected);
  });

  it.each([
    [8.5, 10, '8.5 / 10'],
    [8.5, null, '8.5'],
    [null, null, '—'],
    [null, 10, '—'],
  ])('formats %j/%j as %j', (score, maxScore, expected) => {
    expect(formatScoreDisplay(score, maxScore)).toBe(expected);
  });
});

describe('PAT-003 assignment aggregate status', () => {
  it.each([
    [[], 'need_review'],
    [['graded'], 'graded'],
    [['graded', 'graded'], 'graded'],
    [['graded', 'not_graded'], 'need_review'],
    [['not_graded'], 'need_review'],
  ] as Array<[Array<'graded' | 'not_graded'>, 'graded' | 'need_review']>)(
    'states %j -> %j',
    (submissionGradingStates, expected) => {
      expect(computeAssignmentStatus({ submissionGradingStates })).toBe(expected);
    },
  );
});


describe('PAT-002 review context capture', () => {
  it('captures the current version once and replays afterwards', () => {
    expect(
      decideReviewContextCapture({
        capturedAt: null,
        storedMaterialsVersionId: null,
        currentMaterialsVersionId: 'mv-1',
      }),
    ).toEqual({ action: 'create', materialsVersionId: 'mv-1' });
    expect(
      decideReviewContextCapture({
        capturedAt: '2026-09-24T00:00:00Z',
        storedMaterialsVersionId: 'mv-1',
        currentMaterialsVersionId: 'mv-2',
      }),
    ).toEqual({ action: 'replay', materialsVersionId: 'mv-1' });
  });

  it('stores null when no current materials version exists', () => {
    expect(
      decideReviewContextCapture({
        capturedAt: null,
        storedMaterialsVersionId: null,
        currentMaterialsVersionId: null,
      }),
    ).toEqual({ action: 'create', materialsVersionId: null });
  });

  it('never follows replacement materials after a null capture', () => {
    // PAT-002: a deliberate null capture stays null even when materials appear later.
    expect(
      decideReviewContextCapture({
        capturedAt: '2026-09-24T00:00:00Z',
        storedMaterialsVersionId: null,
        currentMaterialsVersionId: 'mv-9',
      }),
    ).toEqual({ action: 'replay', materialsVersionId: null });
  });
});

describe('REQ-013/PAT-004 retranscription consent', () => {
  const base = {
    confirmed: true,
    anyPageEditedByTeacher: false,
    overwriteTeacherEdits: false,
    submissionHasJudgments: false,
    resetQuestionJudgments: false,
  };

  it('accepts full consent with nothing to reset', () => {
    expect(evaluateRetranscriptionConsent(base)).toEqual([]);
  });

  it.each([
    ['missing confirmation', { confirmed: false }, ['missing_confirmation']],
    [
      'teacher edits without consent',
      { anyPageEditedByTeacher: true },
      ['missing_overwrite_consent'],
    ],
    [
      'judgments without reset consent',
      { submissionHasJudgments: true },
      ['missing_judgment_reset'],
    ],
    [
      'all consent missing',
      {
        confirmed: false,
        anyPageEditedByTeacher: true,
        overwriteTeacherEdits: false,
        submissionHasJudgments: true,
        resetQuestionJudgments: false,
      },
      ['missing_confirmation', 'missing_overwrite_consent', 'missing_judgment_reset'],
    ],
  ] as Array<[string, Partial<typeof base>, string[]]>)('rejects %s', (_name, patch, expected) => {
    expect(evaluateRetranscriptionConsent({ ...base, ...patch })).toEqual(expected);
  });

  it('retry is page-level and only for failed pages', () => {
    expect(isPageRetryEligible({ processingState: 'failed' })).toBe(true);
    expect(isPageRetryEligible({ processingState: 'completed' })).toBe(false);
    expect(isPageRetryEligible({ processingState: 'uploading' })).toBe(false);
  });
});

describe('REQ-016 grading invalidation on draft edit', () => {
  it('clears graded state for submissions and never for materials', () => {
    expect(gradingStateAfterDraftEdit({ documentType: 'submission' })).toBe('not_graded');
    expect(gradingStateAfterDraftEdit({ documentType: 'materials' })).toBe(null);
  });
});

describe('api-routes-documents §3.4 retranscription eligibility', () => {
  it('requires at least one current page and every page completed', () => {
    expect(canRetranscribeDocument(['completed'])).toBe(true);
    expect(canRetranscribeDocument(['completed', 'completed'])).toBe(true);
    expect(canRetranscribeDocument([])).toBe(false);
    expect(canRetranscribeDocument(['completed', 'failed'])).toBe(false);
    expect(canRetranscribeDocument(['completed', 'queued'])).toBe(false);
  });
});

describe('PAT-004 segment currency predicate', () => {
  it('reports whether all segments belong to the current page revision', () => {
    expect(allSegmentsCurrentForPage([{ pageRevision: 2 }, { pageRevision: 2 }], 2)).toBe(true);
    expect(allSegmentsCurrentForPage([{ pageRevision: 1 }, { pageRevision: 2 }], 2)).toBe(false);
    expect(allSegmentsCurrentForPage([], 2)).toBe(true);
  });
});
