import { isDecimal2 } from './schemas';
import type {
  AssignmentStatus,
  DocumentType,
  GradingState,
  PageSummary,
  ProcessingCounts,
  ProcessingState,
  ReviewState,
} from './types';

/**
 * Service-level lifecycle transition functions (TASK-002).
 *
 * Encodes the resolved decisions from REQ-010, REQ-016 through REQ-019,
 * PAT-002, PAT-003, and PAT-004 so the API and UI never derive these rules
 * independently. All functions are pure.
 */

// ——— REQ-010: document processing rollup ————————————————————————————————————

const PROCESSING_ROLLUP_PRECEDENCE = [
  'failed',
  'uploading',
  'transcribing',
  'queued',
  'completed',
] as const satisfies readonly ProcessingState[];

const EMPTY_PROCESSING_COUNTS: ProcessingCounts = {
  uploading: 0,
  queued: 0,
  transcribing: 0,
  completed: 0,
  failed: 0,
  total: 0,
};

/** Deterministic state counts by page state; total equals the five-state sum. */
export const computeProcessingCounts = (pageStates: Iterable<ProcessingState>): ProcessingCounts => {
  const counts: ProcessingCounts = { ...EMPTY_PROCESSING_COUNTS };
  for (const state of pageStates) {
    counts[state] += 1;
  }
  counts.total = counts.uploading + counts.queued + counts.transcribing + counts.completed + counts.failed;
  return counts;
};

/**
 * Rollup precedence is exactly: failed, then uploading, then transcribing,
 * then queued, then completed. An empty page set is `uploading` only while
 * pages are being stored; a structurally empty document reports `null` via
 * `documentProcessingStateForEmpty` callers, not through this function.
 */
export const computeDocumentProcessingState = (
  pageStates: Iterable<ProcessingState>,
): ProcessingState | null => {
  const counts = computeProcessingCounts(pageStates);
  if (counts.total === 0) {
    return null;
  }
  for (const state of PROCESSING_ROLLUP_PRECEDENCE) {
    if (counts[state] > 0) {
      return state;
    }
  }
  return null;
};

// ——— REQ-011/REQ-016/REQ-017: review-state derivations ———————————————————————

export interface ReviewStateInput {
  draftConfirmed: boolean;
  pageStates: ProcessingState[];
  /** reviewedContentRevision === contentRevision for each reviewed page. */
  allPagesReviewed: boolean;
}

/**
 * An unconfirmed, partially processed, or failed document has no review
 * state. Only a confirmed document whose every current page is completed
 * carries `needs_review`; readiness is a separate explicit transition.
 */
export const computeDocumentReviewState = (input: ReviewStateInput): ReviewState | null => {
  if (!input.draftConfirmed || input.pageStates.length === 0) {
    return null;
  }
  const allCompleted = input.pageStates.every((state) => state === 'completed');
  if (!allCompleted) {
    return null;
  }
  return 'needs_review';
};

/** Readiness requires every current page completed and reviewed. */
export const canMarkReady = (input: ReviewStateInput & { allPagesReviewed: boolean }): boolean => {
  const reviewState = computeDocumentReviewState(input);
  return reviewState === 'needs_review' && input.allPagesReviewed;
};

/**
 * A teacher draft edit increments only contentRevision, clears that page's
 * review, and sets the document to `needs_review` when all current pages
 * remain completed, otherwise to `null`.
 */
export const reviewStateAfterDraftEdit = (pageStates: ProcessingState[]): ReviewState | null => {
  const allCompleted = pageStates.length > 0 && pageStates.every((state) => state === 'completed');
  return allCompleted ? 'needs_review' : null;
};

/**
 * REQ-016, submission side: a teacher draft edit also clears the graded
 * state and timestamp while retaining draft score, comments, and question
 * judgments. Materials carry no grading state and return null.
 */
export const gradingStateAfterDraftEdit = (input: {
  documentType: DocumentType;
}): GradingState | null => (input.documentType === 'submission' ? 'not_graded' : null);

/**
 * Allowed review/grading transitions for one page: reviewing is allowed
 * while the document has null or needs_review review state, the page is
 * completed, and the submitted content revision is current. Everything else
 * is forbidden.
 */
export const canReviewPage = (input: {
  documentReviewState: ReviewState | null;
  pageState: ProcessingState;
  expectedContentRevision: number;
  currentContentRevision: number;
  isCurrentPage: boolean;
}): boolean =>
  input.isCurrentPage &&
  input.pageState === 'completed' &&
  (input.documentReviewState === null || input.documentReviewState === 'needs_review') &&
  input.expectedContentRevision === input.currentContentRevision;

// ——— REQ-016/REQ-017/REQ-018: grading transitions ————————————————————————————

export interface GradingStateInput {
  documentType: DocumentType;
  reviewState: ReviewState | null;
  gradingState: GradingState | null;
}

/**
 * Mark graded is allowed only for a current submission in ready_to_grade
 * with gradingState not_graded. Materials never grade.
 */
export const canMarkGraded = (input: GradingStateInput): boolean =>
  input.documentType === 'submission' &&
  input.reviewState === 'ready_to_grade' &&
  input.gradingState === 'not_graded';

/**
 * A returned submission leaves graded state and timestamp behind while
 * retaining draft score, comments, and question judgments (REQ-017).
 */
export const gradingStateAfterReturnToNeedsReview = (
  input: GradingStateInput,
): GradingState | null => (input.documentType === 'submission' ? 'not_graded' : null);

/**
 * Draft-grading mutations (judgment, grading draft, apply total) are allowed
 * while the current completed submission is not_graded and its review state
 * is needs_review or ready_to_grade.
 */
export const canEditGradingDraft = (input: GradingStateInput): boolean =>
  input.documentType === 'submission' &&
  input.gradingState === 'not_graded' &&
  (input.reviewState === 'needs_review' || input.reviewState === 'ready_to_grade');


// ——— REQ-018: score validation ————————————————————————————————————————————————

export interface ScoreValidationInput {
  score: number;
  maxScore: number | null;
}

export type ScoreValidationIssue = 'not_finite' | 'negative' | 'too_many_decimals' | 'exceeds_maximum';

/** Scores are optional, non-negative, <= two decimals, and within the maximum. */
export const validateScore = (input: ScoreValidationInput): ScoreValidationIssue[] => {
  const issues: ScoreValidationIssue[] = [];
  const { score, maxScore } = input;
  if (!Number.isFinite(score)) {
    return ['not_finite'];
  }
  if (score < 0) {
    issues.push('negative');
  }
  if (!isDecimal2(score)) {
    issues.push('too_many_decimals');
  }
  if (maxScore !== null && score > maxScore) {
    issues.push('exceeds_maximum');
  }
  return issues;
};

/** Display is "8.5 / 10" with a maximum or "8.5" without one; no percentages.
 * A null score is ungraded and renders "—" with or without a maximum. */
export const formatScoreDisplay = (score: number | null, maxScore: number | null): string => {
  if (score === null) {
    return '—';
  }
  return maxScore === null ? `${score}` : `${score} / ${maxScore}`;
};

export interface AssignmentAggregateInput {
  /** Created submissions only; roster-only students never enter. */
  submissionGradingStates: GradingState[];
}

/**
 * `graded` only when at least one submission exists and every created
 * submission is graded; every other case is `need_review`. Materials and
 * roster students without a created submission never enter the denominator.
 */
export const computeAssignmentStatus = (input: AssignmentAggregateInput): AssignmentStatus => {
  if (input.submissionGradingStates.length === 0) {
    return 'need_review';
  }
  return input.submissionGradingStates.every((state) => state === 'graded')
    ? 'graded'
    : 'need_review';
};

// ——— PAT-002: review-context capture ——————————————————————————————————————————

export interface ReviewContextCaptureInput {
  /** Server capture timestamp; null only before the first workspace entry. */
  capturedAt: string | null;
  storedMaterialsVersionId: string | null;
  currentMaterialsVersionId: string | null;
}

export type ReviewContextCaptureDecision =
  | { action: 'create'; materialsVersionId: string | null }
  | { action: 'replay'; materialsVersionId: string | null };

/**
 * Context capture is idempotent (PAT-002): the first workspace entry stores
 * the assignment's current material version ID or null, and that value —
 * including a deliberate null — remains immutable afterwards. It never
 * follows replacement materials. The `capturedAt` gate, not the stored ID,
 * distinguishes "never captured" from "captured as null".
 */
export const decideReviewContextCapture = (
  input: ReviewContextCaptureInput,
): ReviewContextCaptureDecision =>
  input.capturedAt !== null
    ? { action: 'replay', materialsVersionId: input.storedMaterialsVersionId }
    : { action: 'create', materialsVersionId: input.currentMaterialsVersionId };

// ——— REQ-013/PAT-004: retranscription consent ——————————————————————————————————

export interface RetranscriptionConsentInput {
  confirmed: boolean;
  anyPageEditedByTeacher: boolean;
  overwriteTeacherEdits: boolean;
  submissionHasJudgments: boolean;
  resetQuestionJudgments: boolean;
}

export type RetranscriptionConsentIssue = 'missing_confirmation' | 'missing_overwrite_consent' | 'missing_judgment_reset';

/** Whole-document retranscription requires explicit, separate consents. */
export const evaluateRetranscriptionConsent = (
  input: RetranscriptionConsentInput,
): RetranscriptionConsentIssue[] => {
  const issues: RetranscriptionConsentIssue[] = [];
  if (!input.confirmed) {
    issues.push('missing_confirmation');
  }
  if (input.anyPageEditedByTeacher && !input.overwriteTeacherEdits) {
    issues.push('missing_overwrite_consent');
  }
  if (input.submissionHasJudgments && !input.resetQuestionJudgments) {
    issues.push('missing_judgment_reset');
  }
  return issues;
};

/**
 * PAT-004: retranscription never remaps question judgments by position. New
 * segment IDs are created for the new transcription revision; superseded
 * segments and their judgments remain audit history and are omitted from the
 * current workspace. This predicate reports whether the given segment set is
 * entirely from the current page revision.
 */
export const allSegmentsCurrentForPage = (
  segments: Array<{ pageRevision: number }>,
  currentPageRevision: number,
): boolean => segments.every((segment) => segment.pageRevision === currentPageRevision);

/**
 * Whole-document retranscription precondition (api-routes-documents §3.4):
 * every current page must be completed. Empty documents are never eligible.
 */
export const canRetranscribeDocument = (pageStates: ProcessingState[]): boolean =>
  pageStates.length > 0 && pageStates.every((state) => state === 'completed');

// ——— Page-summary helpers for rollups ————————————————————————————————————————

/** Page states from API page summaries. */
export const pageStatesFromSummaries = (pages: PageSummary[]): ProcessingState[] =>
  pages.map((page) => page.processingState);

/**
 * The retry path applies to exactly one failed page (REQ-013). Whole-document
 * retranscription is the separate explicit action guarded by consent.
 */
export const isPageRetryEligible = (page: Pick<PageSummary, 'processingState'>): boolean =>
  page.processingState === 'failed';
