/**
 * Assignment Reader cross-runtime wire types.
 *
 * Plain TypeScript types for internal use. Zod schemas at API/provider
 * boundaries live in `schemas.ts`, `content-schema.ts`, and `output-schema.ts`;
 * every named wire type is defined exactly once across these modules,
 * mirroring `plan/assignment-reader/api-routes/api-types.md`. No React, Hono,
 * Postgres, or Worker binding types belong in this package.
 */

import type { QuestionSegmentInput } from './output-schema';

export type UUID = string;
export type ISODateTime = string;

/** Finite, >= 0, at most two fractional digits. */
export type Decimal2 = number;
export type Direction = 'asc' | 'desc';
export type DocumentType = 'materials' | 'submission';
export type ProcessingState =
  | 'uploading'
  | 'queued'
  | 'transcribing'
  | 'completed'
  | 'failed';
export type ReviewState = 'needs_review' | 'ready_to_grade';
export type GradingState = 'not_graded' | 'graded';
export type ClassStatus = 'active' | 'archived';
export type StudentStatus = 'active' | 'removed';
export type AssignmentStatus = 'need_review' | 'graded';
export type FailureCode =
  | 'provider_timeout'
  | 'provider_rejected'
  | 'invalid_output'
  | 'storage_failure'
  | 'invalid_image';

export type ApiErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_MULTIPART'
  | 'UNSUPPORTED_IMAGE'
  | 'IMAGE_TOO_LARGE'
  | 'PAGE_LIMIT_EXCEEDED'
  | 'UNAUTHENTICATED'
  | 'RESOURCE_NOT_FOUND'
  | 'ARCHIVED_ANCESTRY'
  | 'HISTORICAL_VERSION_READ_ONLY'
  | 'INVALID_STATE'
  | 'REVISION_CONFLICT'
  | 'DUPLICATE_PAGE'
  | 'SCORE_EXCEEDS_MAXIMUM'
  | 'CONSENT_REQUIRED'
  | 'QUEUE_DELIVERY_FAILED'
  | 'DELETION_ALREADY_PENDING'
  | 'INTERNAL_ERROR';

export interface ValidationIssue {
  /** Dot path such as "body.maxScore" or "query.page". */
  path: string;
  /** Safe, teacher-displayable text. */
  message: string;
}

export interface ErrorContext {
  currentDocumentRevision?: number;
  currentPageRevision?: number;
  currentContentRevision?: number;
  currentQuestionPointsTotal?: Decimal2;
}

export interface ApiErrorResponse {
  error: string;
  code: ApiErrorCode;
  details?: ValidationIssue[];
  context?: ErrorContext;
}

export interface DataResponse<T> {
  data: T;
}

export interface Pagination {
  page: number; // one-based
  pageSize: 10; // fixed for canonical lists
  totalItems: number;
  totalPages: number; // 0 when totalItems is 0
}

export interface ListResponse<T> {
  data: T[];
  pagination: Pagination;
}

export interface CanonicalListQuery<
  Sort extends string = never,
  Status extends string = never,
> {
  /** Trimmed, 0..200 chars; case-insensitive displayed-column search. */
  q?: string;
  /** Route-specific allow-list; route contract states the default. */
  sort?: Sort;
  /** Default "desc" unless the route says otherwise. */
  direction?: Direction;
  /** Integer >= 1; default 1. */
  page?: number;
  /** Accepted only when the route declares a status filter. */
  status?: Status;
}

// ——— Hierarchy and assignment ————————————————————————————————————————————

export interface ClassRecord {
  id: UUID;
  name: string;
  status: ClassStatus;
  studentCount: number;
  assignmentCount: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  archivedAt: ISODateTime | null;
}

export interface CreateClassBody {
  /** Trimmed, non-empty, max 120 characters. */
  name: string;
}

export interface UpdateClassBody {
  /** When present: trimmed, non-empty, max 120 characters. */
  name?: string;
  /** "active" is not accepted; unarchive is out of scope. */
  status?: 'archived';
}

export interface StudentRecord {
  id: UUID;
  classId: UUID;
  name: string;
  status: StudentStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  removedAt: ISODateTime | null;
}

export interface CreateStudentBody {
  /** Trimmed, non-empty, max 120 characters. */
  name: string;
}

export interface UpdateStudentBody {
  /** Trimmed, non-empty, max 120 characters. */
  name: string;
}

export interface AssignmentListItem {
  id: UUID;
  classId: UUID;
  name: string;
  status: AssignmentStatus;
  maxScore: Decimal2 | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface SubmissionCounts {
  total: number; // created submissions only
  notStarted: number; // active roster students without a submission
  processing: number;
  needsReview: number;
  readyToGrade: number;
  graded: number;
  failed: number;
}

export interface AssignmentRecord extends AssignmentListItem {
  className: string;
  classStatus: ClassStatus;
  currentMaterialVersion: MaterialVersionSummary | null;
  submissionCounts: SubmissionCounts;
}

export interface CreateAssignmentBody {
  /** Trimmed, non-empty, max 200 characters. */
  name: string;
  /** Omission and null both mean no maximum. */
  maxScore?: Decimal2 | null;
}

export interface UpdateAssignmentBody {
  /** When present: trimmed, non-empty, max 200 characters. */
  name?: string;
  /** null removes the maximum. */
  maxScore?: Decimal2 | null;
}

// ——— Seating charts ———————————————————————————————————————————————————————

export type SeatingJobStatus = 'pending' | 'completed' | 'failed';
export type SeatingAlgorithm = 'genetic' | 'llm';
export type SeatingCompletionReason =
  | 'target_met'
  | 'max_generations'
  | 'failed_no_results'
  | 'dropped_from_queue';
export type SeatingRelaxationReason = 'stagnation';

export interface SeatingJobStatusMetadata {
  generationReached: number; // integer >= 0
  maxGenerations: number; // integer >= 1
  resultsDelivered: number; // integer >= 0
  resultsRequested: number; // integer >= 1
  completionReason: SeatingCompletionReason;
  relaxed?: boolean;
  relaxationReason?: SeatingRelaxationReason;
}

export interface SeatingResultItem {
  /** Existing seating_results bigserial identity; integer >= 0. */
  resultId: number;
  arrangement: Array<Array<string | null>>;
  fitnessScore: number; // finite, >= 0
  createdAt: ISODateTime;
}

/**
 * Legacy direct-JSON seating results response; no `data` wrapper.
 */
export interface SeatingResultsResponse {
  jobId: string; // opaque seating-job external ID
  status: SeatingJobStatus;
  algorithm?: SeatingAlgorithm;
  statusMetadata: SeatingJobStatusMetadata | null;
  results: SeatingResultItem[];
  error?: string;
}

export interface SaveSeatingChartBody {
  classId: UUID;
  resultId: number; // integer >= 0
}

export interface SavedSeatingChart {
  id: UUID;
  classId: UUID;
  className: string;
  sourceJobExternalId: string;
  sourceResultId: number;
  grid: Array<Array<string | null>>;
  studentCount: number;
  createdAt: ISODateTime;
}

// ——— Materials, submissions, and document commands ————————————————————————

export type MaterialVersionLifecycle = 'draft' | 'current' | 'historical';

export type SubmissionListStatus =
  | 'not_started'
  | 'uploading'
  | 'queued'
  | 'transcribing'
  | 'error'
  | 'needs_review'
  | 'ready_to_grade'
  | 'graded';

export interface ProcessingCounts {
  uploading: number;
  queued: number;
  transcribing: number;
  completed: number;
  failed: number;
  total: number;
}

export interface MaterialVersionSummary {
  id: UUID;
  assignmentId: UUID;
  version: number; // integer >= 1
  lifecycle: MaterialVersionLifecycle;
  pageCount: number;
  processingState: ProcessingState | null;
  processingCounts: ProcessingCounts;
  reviewState: ReviewState | null;
  /** Integer >= 1; new empty document starts at 1. */
  documentRevision: number;
  createdAt: ISODateTime;
  confirmedAt: ISODateTime | null;
  replacedAt: ISODateTime | null;
  readOnly: boolean;
}

export interface SubmissionRecord {
  id: UUID;
  assignmentId: UUID;
  studentId: UUID;
  studentName: string;
  pageCount: number;
  processingState: ProcessingState | null;
  processingCounts: ProcessingCounts;
  reviewState: ReviewState | null;
  gradingState: GradingState;
  /** Integer >= 1; new empty document starts at 1. */
  documentRevision: number;
  score: Decimal2 | null;
  comments: string | null;
  materialsVersionId: UUID | null;
  reviewContextCapturedAt: ISODateTime | null;
  gradedAt: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  confirmedAt: ISODateTime | null;
  readOnly: boolean;
}

export interface SubmissionListItem {
  studentId: UUID;
  studentName: string;
  submissionId: UUID | null;
  createdAt: ISODateTime | null;
  pageCount: number;
  processingState: ProcessingState | null;
  reviewState: ReviewState | null;
  gradingState: GradingState | null;
  score: Decimal2 | null;
  displayStatus: SubmissionListStatus;
}

export interface CreateSubmissionBody {
  studentId: UUID;
}

export interface CreateSubmissionResult {
  submission: SubmissionRecord;
  created: boolean;
}

export interface ReviewContextResult {
  submissionId: UUID;
  materialsVersion: MaterialVersionSummary | null;
  capturedAt: ISODateTime;
  created: boolean;
}

export interface ReplacePageResult {
  /** New immutable page ID at the replaced position. */
  page: PageSummary;
  replacedPageId: UUID;
  deletionOperationId: UUID;
  documentRevision: number;
}

export interface ConfirmDocumentBody {
  /** Complete ordered current set; 1..20 unique IDs. */
  pageIds: UUID[];
}

export interface ConfirmDocumentResult {
  documentType: DocumentType;
  documentId: UUID;
  documentRevision: number;
  pages: PageSummary[];
  processingState: ProcessingState;
  processingCounts: ProcessingCounts;
  acceptedAt: ISODateTime;
}

export interface RetryPageResult {
  page: PageSummary;
  documentRevision: number;
  documentProcessingState: ProcessingState;
  processingCounts: ProcessingCounts;
}

export interface RetranscribeDocumentBody {
  /** Integer >= 1. */
  expectedDocumentRevision: number;
  confirmed: true;
  overwriteTeacherEdits: boolean;
  resetQuestionJudgments: boolean;
}

// ——— Pages, drafts, images, and processing —————————————————————————————————

export interface SafeFailure {
  code: FailureCode;
  /** Safe recovery text; never a provider payload. */
  message: string;
  retryAllowed: boolean;
  replacementRecommended: boolean;
}

export interface PageSummary {
  id: UUID;
  documentType: DocumentType;
  documentId: UUID;
  /** One-based; contiguous after confirmation. */
  position: number;
  /** Persisted server label, for example "Maya Rodriguez · Page 2". */
  label: string;
  processingState: ProcessingState;
  attemptCount: number;
  queuedAt: ISODateTime | null;
  startedAt: ISODateTime | null;
  completedAt: ISODateTime | null;
  uploadedAt: ISODateTime;
  failure: SafeFailure | null;
  draftAvailable: boolean;
  /** Integer >= 1; new page starts at 1. */
  pageRevision: number;
  /** Integer >= 0. */
  contentRevision: number;
  reviewedContentRevision: number | null;
  editedByTeacher: boolean;
  teacherEditCount: number;
}

export interface TextMark {
  type: 'bold' | 'italic' | 'underline';
}

export interface TextNode {
  type: 'text';
  text: string;
  marks?: TextMark[];
}

export interface HardBreakNode {
  type: 'hardBreak';
}

export interface InlineMathNode {
  type: 'inlineMath';
  attrs: { latex: string };
}

export interface BlockMathNode {
  type: 'blockMath';
  attrs: { latex: string };
}

export type ImageRegionReason = 'diagram' | 'drawing' | 'illegible' | 'other';

export interface ImageRegionNode {
  type: 'imageRegion';
  attrs: {
    regionId: UUID;
    x: number;
    y: number;
    width: number;
    height: number;
    reason: ImageRegionReason;
    label?: string;
  };
}

export type InlineNode = TextNode | HardBreakNode | InlineMathNode;

export interface ParagraphNode {
  type: 'paragraph';
  content?: InlineNode[];
}

export interface HeadingNode {
  type: 'heading';
  attrs: { level: 1 | 2 | 3 };
  content?: InlineNode[];
}

export interface ListItemNode {
  type: 'listItem';
  content: Array<ParagraphNode | BulletListNode | OrderedListNode>;
}

export interface BulletListNode {
  type: 'bulletList';
  content: ListItemNode[];
}

export interface OrderedListNode {
  type: 'orderedList';
  attrs?: { start?: number };
  content: ListItemNode[];
}

export type BlockNode =
  | ParagraphNode
  | HeadingNode
  | BulletListNode
  | OrderedListNode
  | BlockMathNode
  | ImageRegionNode;

export interface AssignmentDraft {
  schemaVersion: 1;
  doc: {
    type: 'doc';
    content: BlockNode[];
  };
}

export type QuestionJudgmentValue = 'unmarked' | 'correct' | 'incorrect';

export interface QuestionJudgment {
  segmentId: UUID;
  judgment: QuestionJudgmentValue;
  awardedPoints: Decimal2 | null;
  comment: string | null;
  updatedAt: ISODateTime | null;
}

export interface QuestionSegment {
  id: UUID;
  pageId: UUID;
  pageRevision: number;
  /** One-based in the current document ordering. */
  ordinal: number;
  label: string | null;
  questionText: string | null;
  responseText: string | null;
  judgment: QuestionJudgment;
}

export interface PageWorkspace {
  page: PageSummary;
  draft: AssignmentDraft;
  /** Always [] for materials. */
  questionSegments: QuestionSegment[];
  reviewedAt: ISODateTime | null;
  readOnly: boolean;
}

export type ImageVariant = 'original' | 'workspace' | 'thumbnail' | 'transcription' | 'region';
export type Rotation = 0 | 90 | 180 | 270;

export interface PageImageQuery {
  /** Default "workspace". */
  variant?: ImageVariant;
  /** Default 0. */
  rotation?: Rotation;
  /** Region only; normalized [0, 1]. */
  x?: number;
  /** Region only; normalized [0, 1]. */
  y?: number;
  /** Region only; normalized (0, 1]. */
  width?: number;
  /** Region only; normalized (0, 1]. */
  height?: number;
}

export interface ProcessingPageItem extends PageSummary {
  elapsedFromQueuedMs: number | null;
  /** Relative app route only when draftAvailable is true. */
  workspacePath: string | null;
}

export interface DocumentProcessingResponse extends ListResponse<ProcessingPageItem> {
  documentType: DocumentType;
  documentId: UUID;
  documentRevision: number;
  processingState: ProcessingState | null;
  processingCounts: ProcessingCounts;
  reviewState: ReviewState | null;
  /** Whether the submission currently has any current (live page-revision)
   * question judgment; always false for materials, which never carry
   * judgments. Gates the retranscription judgment-reset consent checkbox. */
  hasQuestionJudgments: boolean;
}

export interface DocumentAggregate {
  documentType: DocumentType;
  documentId: UUID;
  documentRevision: number;
  processingState: ProcessingState | null;
  processingCounts: ProcessingCounts;
  reviewState: ReviewState | null;
  pageCount: number;
  draftConfirmed: boolean;
  readOnly: boolean;
}

// ——— Workspace, review, and grading ————————————————————————————————————————

export type DocumentAction =
  | 'upload_page'
  | 'confirm'
  | 'retry_page'
  | 'replace_page'
  | 'retranscribe'
  | 'edit_draft'
  | 'review_page'
  | 'mark_ready'
  | 'return_to_needs_review'
  | 'edit_grading'
  | 'edit_question_judgments'
  | 'mark_graded'
  | 'delete';

export interface DocumentWorkspace {
  documentType: DocumentType;
  documentId: UUID;
  class: Pick<ClassRecord, 'id' | 'name' | 'status'>;
  assignment: Pick<AssignmentRecord, 'id' | 'name' | 'maxScore'>;
  student: Pick<StudentRecord, 'id' | 'name'> | null;
  materialVersion: MaterialVersionSummary | null;
  submission: SubmissionRecord | null;
  pages: PageSummary[];
  processingState: ProcessingState | null;
  processingCounts: ProcessingCounts;
  reviewState: ReviewState | null;
  gradingState: GradingState | null;
  documentRevision: number;
  reviewContext: MaterialVersionSummary | null;
  reviewContextCaptured: boolean;
  readOnly: boolean;
  allowedActions: DocumentAction[];
}

export interface UpdatePageDraftBody {
  draft: AssignmentDraft;
  /** Integer >= 0. */
  expectedContentRevision: number;
}

export interface ReviewPageBody {
  /** Integer >= 0. */
  expectedContentRevision: number;
}

export interface ReviewPageResult {
  pageId: UUID;
  reviewedContentRevision: number;
  reviewedAt: ISODateTime;
  documentReviewState: ReviewState | null;
  allCurrentPagesReviewed: boolean;
}

export interface DocumentRevisionCommandBody {
  /** Integer >= 1. */
  expectedDocumentRevision: number;
}

export interface DocumentStateResult {
  documentType: DocumentType;
  documentId: UUID;
  reviewState: ReviewState;
  gradingState: GradingState | null;
  documentRevision: number;
  updatedAt: ISODateTime;
}

export interface UpdateQuestionJudgmentBody {
  /** Integer >= 1. */
  expectedPageRevision: number;
  judgment: QuestionJudgmentValue;
  awardedPoints: Decimal2 | null;
  /** Max 2,000 characters. */
  comment: string | null;
}

export interface UpdateGradingDraftBody {
  /** Integer >= 1. */
  expectedDocumentRevision: number;
  score?: Decimal2 | null;
  /** Max 4,000 characters. */
  comments?: string | null;
}

export interface GradingDraft {
  submissionId: UUID;
  documentRevision: number;
  score: Decimal2 | null;
  comments: string | null;
  questionJudgments: QuestionJudgment[];
  gradingState: GradingState;
  gradedAt: ISODateTime | null;
  updatedAt: ISODateTime;
}

export interface QuestionPointsTotalQuery {
  /** Integer >= 1. */
  expectedDocumentRevision: number;
}

export interface QuestionPointsSegment {
  id: UUID;
  ordinal: number;
  label: string | null;
  questionText: string | null;
  awardedPoints: Decimal2 | null;
}

export interface QuestionPointsTotal {
  submissionId: UUID;
  documentRevision: number;
  total: Decimal2;
  segmentsWithPoints: number;
  totalSegments: number;
  segments: QuestionPointsSegment[];
}

export interface ApplyQuestionPointsBody {
  /** Integer >= 1. */
  expectedDocumentRevision: number;
  expectedTotal: Decimal2;
  confirmed: true;
}

// ——— Deletion ———————————————————————————————————————————————————————————————

export type DeletionTargetType =
  | 'page'
  | 'materials'
  | 'submission'
  | 'student_data'
  | 'assignment'
  | 'class'
  | 'account';

export interface DeletionOperation {
  id: UUID;
  targetType: DeletionTargetType;
  targetId: UUID;
  status: 'pending';
  acceptedAt: ISODateTime;
}

// ——— Provider/output contract (worker side) ————————————————————————————————

export interface TranscriptionModelOutput {
  draft: AssignmentDraft;
  questionSegments: QuestionSegmentInput[];
}

export interface TranscriptionUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUsd?: number;
}

export interface TranscriptionAttemptAudit {
  documentType: DocumentType;
  model: string;
  attempt: number;
  queuedAtMs: number;
  startedAtMs: number;
  endedAtMs: number;
  latencyMs: number;
  outcome: 'completed' | 'failed' | 'retry';
  failureCode: FailureCode | null;
  usage: TranscriptionUsage | null;
  costUsd: number | null;
  costSource: 'provider_reported' | 'token_estimate' | 'unavailable' | null;
  isRetry: boolean;
}
