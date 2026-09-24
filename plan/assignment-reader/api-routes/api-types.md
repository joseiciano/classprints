# Assignment Reader API Types

**Status:** Planned  
**Audience:** Assignment Reader API, frontend, worker, and test implementers

This file is the single canonical home for every named wire type in the Assignment Reader HTTP contract. Route files and [`api-manifest.md`](api-manifest.md) reference these names and do not redefine them. JSON uses camelCase, UUIDs use lowercase canonical RFC 4122 strings, timestamps use UTC RFC 3339/ISO 8601 strings, and decimal values have at most two fractional digits.

## 1. Protocol, envelope, error, and list types

```ts
type UUID = string;
type ISODateTime = string;
type Decimal2 = number; // finite, >= 0, at most two fractional digits
type Direction = "asc" | "desc";
type DocumentType = "materials" | "submission";
type ProcessingState = "uploading" | "queued" | "transcribing" | "completed" | "failed";
type ReviewState = "needs_review" | "ready_to_grade";
type GradingState = "not_graded" | "graded";
type ClassStatus = "active" | "archived";
type StudentStatus = "active" | "removed";
type AssignmentStatus = "need_review" | "graded";
type FailureCode =
  | "provider_timeout"
  | "provider_rejected"
  | "invalid_output"
  | "storage_failure"
  | "invalid_image";

interface DataResponse<T> {
  data: T;
}

interface Pagination {
  page: number;       // one-based
  pageSize: 10;       // fixed for canonical lists
  totalItems: number;
  totalPages: number; // 0 when totalItems is 0
}

interface ListResponse<T> {
  data: T[];
  pagination: Pagination;
}

interface CanonicalListQuery<Sort extends string, Status extends string = never> {
  q?: string;            // trimmed, 0..200 chars; case-insensitive displayed-column search
  sort?: Sort;           // route-specific allow-list; route contract states the default
  direction?: Direction; // default "desc" unless the route says otherwise
  page?: number;         // integer >= 1; default 1
  status?: Status;       // accepted only when the route declares a status filter
}

type ApiErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_MULTIPART"
  | "UNSUPPORTED_IMAGE"
  | "IMAGE_TOO_LARGE"
  | "PAGE_LIMIT_EXCEEDED"
  | "UNAUTHENTICATED"
  | "RESOURCE_NOT_FOUND"
  | "ARCHIVED_ANCESTRY"
  | "HISTORICAL_VERSION_READ_ONLY"
  | "INVALID_STATE"
  | "REVISION_CONFLICT"
  | "DUPLICATE_PAGE"
  | "SCORE_EXCEEDS_MAXIMUM"
  | "CONSENT_REQUIRED"
  | "QUEUE_DELIVERY_FAILED"
  | "INTERNAL_ERROR";

interface ValidationIssue {
  path: string;    // dot path such as "body.maxScore" or "query.page"
  message: string; // safe, teacher-displayable text
}

interface ErrorContext {
  currentDocumentRevision?: number;
  currentPageRevision?: number;
  currentContentRevision?: number;
  currentQuestionPointsTotal?: Decimal2;
}

interface ApiErrorResponse {
  error: string;
  code: ApiErrorCode;
  details?: ValidationIssue[];
  context?: ErrorContext;
}
```

Unknown request fields are rejected. `CanonicalListQuery` never accepts `pageSize`. Except for the explicit exceptions in manifest §1.5, canonical lists use the requested sort followed by `id asc` as a stable tiebreak.

## 2. Hierarchy and assignment types

```ts
interface ClassRecord {
  id: UUID;
  name: string;
  status: ClassStatus;
  studentCount: number;
  assignmentCount: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  archivedAt: ISODateTime | null;
}

interface CreateClassBody {
  name: string; // trimmed, non-empty, max 120 characters
}

interface UpdateClassBody {
  name?: string;       // when present: trimmed, non-empty, max 120 characters
  status?: "archived"; // "active" is not accepted; unarchive is out of scope
}

interface StudentRecord {
  id: UUID;
  classId: UUID;
  name: string;
  status: StudentStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  removedAt: ISODateTime | null;
}

interface CreateStudentBody {
  name: string; // trimmed, non-empty, max 120 characters
}

interface UpdateStudentBody {
  name: string; // trimmed, non-empty, max 120 characters
}

interface AssignmentListItem {
  id: UUID;
  classId: UUID;
  name: string;
  status: AssignmentStatus;
  maxScore: Decimal2 | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

interface SubmissionCounts {
  total: number;       // created submissions only
  notStarted: number;  // active roster students without a submission
  processing: number;
  needsReview: number;
  readyToGrade: number;
  graded: number;
  failed: number;
}

interface AssignmentRecord extends AssignmentListItem {
  className: string;
  classStatus: ClassStatus;
  currentMaterialVersion: MaterialVersionSummary | null;
  submissionCounts: SubmissionCounts;
}

interface CreateAssignmentBody {
  name: string;               // trimmed, non-empty, max 200 characters
  maxScore?: Decimal2 | null; // omission and null both mean no maximum
}

interface UpdateAssignmentBody {
  name?: string;               // when present: trimmed, non-empty, max 200 characters
  maxScore?: Decimal2 | null;  // null removes the maximum
}
```

`UpdateClassBody` and `UpdateAssignmentBody` require at least one field. `AssignmentStatus` is `graded` only when at least one submission exists and every created submission is graded; material state and roster-only students do not enter that denominator.

## 3. Seating types

```ts
type SeatingJobStatus = "pending" | "completed" | "failed";
type SeatingAlgorithm = "genetic" | "llm";
type SeatingCompletionReason =
  | "target_met"
  | "max_generations"
  | "failed_no_results"
  | "dropped_from_queue";
type SeatingRelaxationReason = "stagnation";

interface SeatingJobStatusMetadata {
  generationReached: number; // integer >= 0
  maxGenerations: number;    // integer >= 1
  resultsDelivered: number;  // integer >= 0
  resultsRequested: number;  // integer >= 1
  completionReason: SeatingCompletionReason;
  relaxed?: boolean;
  relaxationReason?: SeatingRelaxationReason;
}

interface SeatingResultItem {
  resultId: number; // existing seating_results bigserial identity; integer >= 0
  arrangement: Array<Array<string | null>>;
  fitnessScore: number; // finite, >= 0
  createdAt: ISODateTime;
}

type SeatingResultsResponse = {
  jobId: string; // opaque seating-job external ID
  status: SeatingJobStatus;
  algorithm?: SeatingAlgorithm;
  statusMetadata: SeatingJobStatusMetadata | null;
  results: SeatingResultItem[];
  error?: string;
};

interface SaveSeatingChartBody {
  classId: UUID;
  resultId: number; // integer >= 0
}

interface SavedSeatingChart {
  id: UUID;
  classId: UUID;
  className: string;
  sourceJobExternalId: string;
  sourceResultId: number;
  grid: Array<Array<string | null>>;
  studentCount: number;
  createdAt: ISODateTime;
}
```

`resultId` and `sourceResultId` are JSON numbers because they expose the existing `seating_results.id` bigserial identity. A missing job/result/class and a resource owned by another teacher both return `404 RESOURCE_NOT_FOUND`.

## 4. Material, submission, and document command types

```ts
type MaterialVersionLifecycle = "draft" | "current" | "historical";

type SubmissionListStatus =
  | "not_started"
  | "uploading"
  | "queued"
  | "transcribing"
  | "error"
  | "needs_review"
  | "ready_to_grade"
  | "graded";

interface ProcessingCounts {
  uploading: number;
  queued: number;
  transcribing: number;
  completed: number;
  failed: number;
  total: number;
}

interface MaterialVersionSummary {
  id: UUID;
  assignmentId: UUID;
  version: number; // integer >= 1
  lifecycle: MaterialVersionLifecycle;
  pageCount: number;
  processingState: ProcessingState | null;
  processingCounts: ProcessingCounts;
  reviewState: ReviewState | null;
  documentRevision: number; // integer >= 1; new empty document starts at 1
  createdAt: ISODateTime;
  confirmedAt: ISODateTime | null;
  replacedAt: ISODateTime | null;
  readOnly: boolean;
}

interface SubmissionRecord {
  id: UUID;
  assignmentId: UUID;
  studentId: UUID;
  studentName: string;
  pageCount: number;
  processingState: ProcessingState | null;
  processingCounts: ProcessingCounts;
  reviewState: ReviewState | null;
  gradingState: GradingState;
  documentRevision: number; // integer >= 1; new empty document starts at 1
  score: Decimal2 | null;
  comments: string | null;
  materialsVersionId: UUID | null;
  reviewContextCapturedAt: ISODateTime | null;
  gradedAt: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  readOnly: boolean;
}

interface SubmissionListItem {
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

interface CreateSubmissionBody {
  studentId: UUID;
}

interface CreateSubmissionResult {
  submission: SubmissionRecord;
  created: boolean;
}

interface ReviewContextResult {
  submissionId: UUID;
  materialsVersion: MaterialVersionSummary | null;
  capturedAt: ISODateTime;
  created: boolean;
}

interface ReplacePageResult {
  page: PageSummary; // new immutable page ID at the replaced position
  replacedPageId: UUID;
  deletionOperationId: UUID;
  documentRevision: number;
}

interface ConfirmDocumentBody {
  pageIds: UUID[]; // complete ordered current set; 1..20 unique IDs
}

interface ConfirmDocumentResult {
  documentType: DocumentType;
  documentId: UUID;
  documentRevision: number;
  pages: PageSummary[];
  processingState: ProcessingState;
  processingCounts: ProcessingCounts;
  acceptedAt: ISODateTime;
}

interface RetryPageResult {
  page: PageSummary;
  documentRevision: number;
  documentProcessingState: ProcessingState;
  processingCounts: ProcessingCounts;
}

interface RetranscribeDocumentBody {
  expectedDocumentRevision: number; // integer >= 1
  confirmed: true;
  overwriteTeacherEdits: boolean;
  resetQuestionJudgments: boolean;
}
```

`ProcessingCounts.total` must equal `uploading + queued + transcribing + completed + failed`. Consumers must not infer that an enclosing payload also has `pageCount`; only types that declare `pageCount` carry it.

A new material version is `draft` with `documentRevision: 1`; a new submission likewise starts empty at revision 1. Successful current-material page-set changes require a new draft version; confirming that non-empty draft promotes it to `current` and makes the prior current version `historical`. Repeating confirmation after it was accepted returns `409 INVALID_STATE`; `retry-confirm` exists only to recover queue delivery for the already accepted revision. Empty documents cannot be confirmed.

A submission may accept a page after an earlier confirmation, but doing so invalidates readiness and grading, marks its current page set as requiring confirmation, and does not enqueue until confirmation succeeds again.

`displayStatus` derivation for `SubmissionListItem`: `not_started` marks the roster projection; otherwise the row's `processingState` maps directly except `failed`, which displays as `error` (teacher-facing copy per the product doc's processing states); `needs_review`/`ready_to_grade` come from `reviewState`, and `graded` takes precedence when `gradingState` is `graded`.

## 5. Page, draft, image, and processing types

```ts
interface SafeFailure {
  code: FailureCode;
  message: string; // safe recovery text; never a provider payload
  retryAllowed: boolean;
  replacementRecommended: boolean;
}

interface PageSummary {
  id: UUID;
  documentType: DocumentType;
  documentId: UUID;
  position: number; // one-based; contiguous after confirmation
  label: string;    // persisted server label, for example "Maya Rodriguez · Page 2"
  processingState: ProcessingState;
  attemptCount: number;
  queuedAt: ISODateTime | null;
  startedAt: ISODateTime | null;
  completedAt: ISODateTime | null;
  uploadedAt: ISODateTime;
  failure: SafeFailure | null;
  draftAvailable: boolean;
  pageRevision: number; // integer >= 1; new page starts at 1
  contentRevision: number; // integer >= 0
  reviewedContentRevision: number | null;
  editedByTeacher: boolean;
  teacherEditCount: number;
}

interface TextMark {
  type: "bold" | "italic" | "underline";
}

interface TextNode {
  type: "text";
  text: string;
  marks?: TextMark[];
}

interface HardBreakNode {
  type: "hardBreak";
}

interface InlineMathNode {
  type: "inlineMath";
  attrs: { latex: string };
}

interface BlockMathNode {
  type: "blockMath";
  attrs: { latex: string };
}

interface ImageRegionNode {
  type: "imageRegion";
  attrs: {
    regionId: UUID;
    x: number;
    y: number;
    width: number;
    height: number;
    reason: "diagram" | "drawing" | "illegible" | "other";
    label?: string;
  };
}

type InlineNode = TextNode | HardBreakNode | InlineMathNode;

interface ParagraphNode {
  type: "paragraph";
  content?: InlineNode[];
}

interface HeadingNode {
  type: "heading";
  attrs: { level: 1 | 2 | 3 };
  content?: InlineNode[];
}

interface ListItemNode {
  type: "listItem";
  content: Array<ParagraphNode | BulletListNode | OrderedListNode>;
}

interface BulletListNode {
  type: "bulletList";
  content: ListItemNode[];
}

interface OrderedListNode {
  type: "orderedList";
  attrs?: { start?: number };
  content: ListItemNode[];
}

type BlockNode =
  | ParagraphNode
  | HeadingNode
  | BulletListNode
  | OrderedListNode
  | BlockMathNode
  | ImageRegionNode;

interface AssignmentDraft {
  schemaVersion: 1;
  doc: {
    type: "doc";
    content: BlockNode[];
  };
}

interface QuestionJudgment {
  segmentId: UUID;
  judgment: "unmarked" | "correct" | "incorrect";
  awardedPoints: Decimal2 | null;
  comment: string | null;
  updatedAt: ISODateTime | null;
}

interface QuestionSegment {
  id: UUID;
  pageId: UUID;
  pageRevision: number;
  ordinal: number; // one-based in the current document ordering
  label: string | null;
  questionText: string | null;
  responseText: string | null;
  judgment: QuestionJudgment;
}

interface PageWorkspace {
  page: PageSummary;
  draft: AssignmentDraft;
  questionSegments: QuestionSegment[]; // always [] for materials
  reviewedAt: ISODateTime | null;
  readOnly: boolean;
}

type ImageVariant = "original" | "workspace" | "thumbnail" | "transcription" | "region";
type Rotation = 0 | 90 | 180 | 270;

interface PageImageQuery {
  variant?: ImageVariant; // default "workspace"
  rotation?: Rotation;    // default 0
  x?: number;             // region only; normalized [0, 1]
  y?: number;             // region only; normalized [0, 1]
  width?: number;         // region only; normalized (0, 1]
  height?: number;        // region only; normalized (0, 1]
}

interface ProcessingPageItem extends PageSummary {
  elapsedFromQueuedMs: number | null;
  workspacePath: string | null; // relative app route only when draftAvailable is true
}

interface DocumentProcessingResponse extends ListResponse<ProcessingPageItem> {
  documentType: DocumentType;
  documentId: UUID;
  documentRevision: number;
  processingState: ProcessingState | null;
  processingCounts: ProcessingCounts;
  reviewState: ReviewState | null;
}

interface DocumentAggregate {
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
```

For `variant=region`, all four crop fields are required, `x + width <= 1`, and `y + height <= 1`; crop fields are rejected for every other variant. Coordinates and bounds are evaluated against the canonical unrotated JPEG. The server crops that canonical image first and applies `rotation` to the resulting variant second.

Draft validation rejects unknown nodes, marks, attributes, or fields; serialized payloads over 1 MiB; documents over 5,000 nodes; LaTeX strings over 4,096 characters; and image regions outside `[0, 1]` or the canonical page bounds.

`attemptCount` is the count of accepted worker executions for the current `pageRevision`. It resets when `pageRevision` changes and excludes queue-delivery retries and provider/model retries within one worker execution. Cross-revision attempt audit history is internal and does not alter this client-visible counter.

## 6. Workspace, review, and grading types

```ts
type DocumentAction =
  | "upload_page"
  | "confirm"
  | "retry_page"
  | "replace_page"
  | "retranscribe"
  | "edit_draft"
  | "review_page"
  | "mark_ready"
  | "return_to_needs_review"
  | "edit_grading"
  | "edit_question_judgments"
  | "mark_graded"
  | "delete";

interface DocumentWorkspace {
  documentType: DocumentType;
  documentId: UUID;
  class: Pick<ClassRecord, "id" | "name" | "status">;
  assignment: Pick<AssignmentRecord, "id" | "name" | "maxScore">;
  student: Pick<StudentRecord, "id" | "name"> | null;
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

interface UpdatePageDraftBody {
  draft: AssignmentDraft;
  expectedContentRevision: number; // integer >= 0
}

interface ReviewPageBody {
  expectedContentRevision: number; // integer >= 0
}

interface ReviewPageResult {
  pageId: UUID;
  reviewedContentRevision: number;
  reviewedAt: ISODateTime;
  documentReviewState: ReviewState | null;
  allCurrentPagesReviewed: boolean;
}

interface DocumentRevisionCommandBody {
  expectedDocumentRevision: number; // integer >= 1
}

interface DocumentStateResult {
  documentType: DocumentType;
  documentId: UUID;
  reviewState: ReviewState;
  gradingState: GradingState | null;
  documentRevision: number;
  updatedAt: ISODateTime;
}

interface UpdateQuestionJudgmentBody {
  expectedPageRevision: number; // integer >= 1
  judgment: "unmarked" | "correct" | "incorrect";
  awardedPoints: Decimal2 | null;
  comment: string | null; // max 2,000 characters
}

interface UpdateGradingDraftBody {
  expectedDocumentRevision: number; // integer >= 1
  score?: Decimal2 | null;
  comments?: string | null; // max 4,000 characters
}

interface GradingDraft {
  submissionId: UUID;
  documentRevision: number;
  score: Decimal2 | null;
  comments: string | null;
  questionJudgments: QuestionJudgment[];
  gradingState: GradingState;
  gradedAt: ISODateTime | null;
  updatedAt: ISODateTime;
}

interface QuestionPointsTotalQuery {
  expectedDocumentRevision: number; // integer >= 1
}

interface QuestionPointsSegment {
  id: UUID;
  ordinal: number;
  label: string | null;
  questionText: string | null;
  awardedPoints: Decimal2 | null;
}

interface QuestionPointsTotal {
  submissionId: UUID;
  documentRevision: number;
  total: Decimal2;
  segmentsWithPoints: number;
  totalSegments: number;
  segments: QuestionPointsSegment[];
}

interface ApplyQuestionPointsBody {
  expectedDocumentRevision: number; // integer >= 1
  expectedTotal: Decimal2;
  confirmed: true;
}
```

`UpdateGradingDraftBody` requires at least one of `score` or `comments`. Mark-ready and mark-graded reject empty documents. Mark-ready also requires every current page to be completed and reviewed at its current `contentRevision`.

## 7. Revision, lifecycle, invalidation, and historical-read rules

The three revision fields are independent and must never be collapsed into a generic transcription revision:

- `documentRevision` is document-scoped. It increments when the current page set or generated content changes. Document readiness, grading, question-total, and whole-document retranscription commands use `expectedDocumentRevision`.
- `pageRevision` is page-transcription-scoped. It increments when that page is reprocessed or replaced. `QuestionSegment` belongs to one `pageRevision`, and judgment commands use `expectedPageRevision`.
- `contentRevision` is teacher-edit-scoped. Saving a draft increments it; reviewing or editing a draft uses `expectedContentRevision`.

Retrying one failed page increments that page's `pageRevision` and its document's `documentRevision` without retranscribing siblings. Whole-document retranscription increments `documentRevision` and every current page's `pageRevision`; it requires `expectedDocumentRevision`, `confirmed: true`, and the declared consent flags. Replacing an eligible page also creates a new immutable page ID at the same position and increments both scopes.

An unconfirmed, partially processed, or failed document has `reviewState: null`. Acceptance of generated content for the last current page transitions the document to `needs_review`. Any current page-set or generated-content change invalidates readiness, increments `documentRevision`, and, for a submission, sets `gradingState: "not_graded"` and `gradedAt: null` while retaining score, comments, and judgments unless an explicit reset was requested.

A teacher draft edit increments only `contentRevision`, clears that page's review, and sets the document to `needs_review` if all current pages remain completed or to `null` otherwise. It also clears submission graded state and timestamp while retaining grading values.

Unconfirmed pages may be replaced and remain unconfirmed. A confirmed page may be replaced only as failed-page recovery; the replacement is queued automatically. A queue-send failure returns `500 QUEUE_DELIVERY_FAILED` and remains recoverable with retry-confirm.

Historical material-version summary, aggregate, workspace, page, and image reads are allowed. They are read-only: `readOnly` is true, mutation entries are absent from `allowedActions`, and mutation attempts return `409 HISTORICAL_VERSION_READ_ONLY`. Archived ancestry remains readable; destructive deletion is allowed, while other mutations return `409 ARCHIVED_ANCESTRY`.

## 8. Deletion types and command behavior

```ts
type DeletionTargetType =
  | "page"
  | "materials"
  | "submission"
  | "student_data"
  | "assignment"
  | "class"
  | "account";

interface DeletionOperation {
  id: UUID;
  targetType: DeletionTargetType;
  targetId: UUID;
  status: "pending";
  acceptedAt: ISODateTime;
}
```

For ordinary authenticated delete commands (`page`, `materials`, `submission`, `student_data`, `assignment`, and `class`), the controller checks for an owned pending operation before normal target lookup. The first accepted delete returns `202`; replay while that operation remains pending returns it with `200`. Every other route to a pending resource returns `404 RESOURCE_NOT_FOUND`. Once cleanup completes, both the target and another delete request return `404 RESOURCE_NOT_FOUND`.

Account deletion is different: the first accepted request returns `202` and immediately revokes the teacher's sessions. It is therefore not teacher-replayable. Only internal cleanup and operator recovery are replay-safe after acceptance; a later unauthenticated request does not receive the prior operation.
