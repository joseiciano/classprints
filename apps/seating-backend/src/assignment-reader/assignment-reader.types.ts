import type {
  ProcessingState,
  ClassListQuery,
  StudentListQuery,
  AssignmentListQuery,
  SubmissionListQuery,
  ProcessingListQuery,
} from '@classprints/assignment-reader-shared';

/**
 * Internal repository row shapes (snake_case) mapped to shared wire types at
 * the repository boundary. Millisecond timestamps stay bigint in SQL and are
 * converted to ISO 8601 at the boundary (api-types.md §1.2).
 */

export interface ClassRow {
  id: string;
  teacher_id: string;
  name: string;
  status: 'active' | 'archived';
  archived_at_ms: number | null;
  created_at_ms: number | string;
  updated_at_ms: number | string;
}

export interface StudentRow {
  id: string;
  class_id: string;
  teacher_id: string;
  name: string;
  status: 'active' | 'removed';
  created_at_ms: number | string;
  updated_at_ms: number | string;
  removed_at_ms: number | null;
}

export interface AssignmentRow {
  id: string;
  class_id: string;
  teacher_id: string;
  name: string;
  status: 'need_review' | 'graded';
  max_score: string | number | null;
  created_at_ms: number | string;
  updated_at_ms: number | string;
}

export interface SubmissionRow {
  id: string;
  assignment_id: string;
  class_id: string;
  student_id: string;
  teacher_id: string;
  document_revision: number;
  draft_confirmed: boolean;
  confirmed_at_ms: number | null;
  review_state: 'needs_review' | 'ready_to_grade' | null;
  grading_state: 'not_graded' | 'graded';
  score: string | number | null;
  comments: string | null;
  materials_version_id: string | null;
  review_context_captured_at_ms: number | null;
  graded_at_ms: number | null;
  created_at_ms: number | string;
  updated_at_ms: number | string;
}

export interface MaterialVersionRow {
  id: string;
  assignment_id: string;
  teacher_id: string;
  version: number;
  lifecycle: 'draft' | 'current' | 'historical';
  document_revision: number;
  draft_confirmed: boolean;
  confirmed_at_ms: number | null;
  replaced_at_ms: number | null;
  created_at_ms: number | string;
  updated_at_ms: number | string;
}

export interface PageStateRow {
  parent_material_version_id: string | null;
  parent_submission_id: string | null;
  processing_state: ProcessingState;
}

export interface DeletionPendingRow {
  target_id: string;
}

/** Counted aggregates joined into list rows. */
export interface ClassCountRow {
  student_count: number;
  assignment_count: number;
}

/** Page row used by the Phase 4 upload/confirm/delivery commands (TASK-010/011). */
export interface PageRow {
  id: string;
  document_type: 'materials' | 'submission';
  materials_version_id: string | null;
  submission_id: string | null;
  student_id: string | null;
  class_id: string;
  assignment_id: string;
  teacher_id: string;
  position: number;
  label: string;
  storage_key: string;
  processing_state: ProcessingState;
  attempt_count: number;
  page_revision: number;
  content_revision: number;
  reviewed_content_revision: number | null;
  reviewed_at_ms: number | null;
  edited_by_teacher: boolean;
  teacher_edit_count: number;
  draft: unknown;
  failure_code: string | null;
  failure_message: string | null;
  queued_at_ms: number | null;
  started_at_ms: number | null;
  completed_at_ms: number | null;
  uploaded_at_ms: number | string;
  created_at_ms: number | string;
  updated_at_ms: number | string;
}

/** Document-level status read by upload/confirm/replace/remove commands. */
export interface DocumentStatusRow {
  document_type: 'materials' | 'submission';
  document_id: string;
  document_revision: number;
  draft_confirmed: boolean;
  class_id: string;
  assignment_id: string;
  student_id: string | null;
  class_status: 'active' | 'archived';
  student_name: string | null;
  lifecycle: 'draft' | 'current' | 'historical' | null;
}

export interface InsertPageInput {
  /** Service-generated (crypto.randomUUID()) so the storage key can be
   * computed before the row exists (TASK-010: R2 write precedes the insert). */
  id: string;
  teacherId: string;
  documentType: 'materials' | 'submission';
  materialsVersionId: string | null;
  submissionId: string | null;
  studentId: string | null;
  classId: string;
  assignmentId: string;
  /** "Materials" or the student's name; the repository appends
   * " · Page {position}" once the atomically-assigned position is known. */
  ownerLabel: string;
  storageKey: string;
}

/** Result of an atomic append-page insert; null means the document already
 * has 20 current pages (PAGE_LIMIT_EXCEEDED — the caller must compensate by
 * deleting the R2 object it already wrote). */
export type InsertPageResult = PageRow | null;

export interface RewriteOrderInput {
  teacherId: string;
  documentType: 'materials' | 'submission';
  documentId: string;
  orderedPageIds: string[];
  /** Whether the supplied order differs from the stored current order
   * (api-routes-documents.md §2.5: confirm itself only bumps
   * documentRevision when the order actually changes). */
  orderChanged: boolean;
}

export interface ConfirmDocumentOrderResult {
  documentRevision: number;
  pages: PageRow[];
  /** Pages moved uploading -> queued by this confirm; the caller sends one
   * TranscriptionPageMessage per seed after commit. */
  queuedSeeds: Array<{ pageId: string; pageRevision: number }>;
}

export interface ReplacePageInput {
  /** New page's service-generated id. */
  id: string;
  teacherId: string;
  documentType: 'materials' | 'submission';
  materialsVersionId: string | null;
  submissionId: string | null;
  studentId: string | null;
  classId: string;
  assignmentId: string;
  replacedPageId: string;
  position: number;
  pageRevision: number;
  label: string;
  storageKey: string;
  /** Whether the replaced page's document was confirmed (failed-page
   * recovery path): the new page is queued immediately instead of staying
   * unconfirmed. */
  requeueImmediately: boolean;
}

export interface ReplacePageResultRow {
  page: PageRow;
  documentRevision: number;
  replacedStorageKey: string;
}

export interface MarkQueuedInput {
  teacherId: string;
  documentType: 'materials' | 'submission';
  documentId: string;
  queuedAtMs: number;
  attemptSeeds: Array<{ pageId: string; pageRevision: number }>;
}

export interface RemovePageResultRow {
  documentRevision: number;
  removedStorageKey: string;
}

/** Result of an atomic single-page retry (TASK-015 §3.3). Null from the
 * repository means the page was no longer exactly `failed` when the
 * conditional update ran (pre-commit race): the caller returns 409 rather
 * than replaying the retry. */
export interface RetryPageRowResult {
  page: PageRow;
  documentRevision: number;
}

export interface RetranscribeDocumentRowsInput {
  teacherId: string;
  documentType: 'materials' | 'submission';
  documentId: string;
  /** Compare-and-swap guard matching `RetranscribeDocumentBody.expectedDocumentRevision`. */
  expectedDocumentRevision: number;
}

/** Null means the document's revision no longer matched
 * `expectedDocumentRevision` when the conditional update ran (409
 * REVISION_CONFLICT); nothing was committed. */
export interface RetranscribeDocumentRowsResult {
  documentRevision: number;
  pages: PageRow[];
}

export interface SubmissionListRow extends SubmissionRow {
  student_name: string;
  student_active: boolean;
  page_count: number;
  processing_state: ProcessingState | null;
  completed_pages: number;
  failed_pages: number;
}

/** One page of a document, joined with its parent identity for the
 * Processing list (TASK-008). Parent exclusivity mirrors the database
 * `pages_parent_exclusive` constraint. */
export interface ProcessingPageRow {
  id: string;
  document_type: 'materials' | 'submission';
  materials_version_id: string | null;
  submission_id: string | null;
  position: number;
  label: string;
  processing_state: ProcessingState;
  attempt_count: number;
  page_revision: number;
  content_revision: number;
  reviewed_content_revision: number | null;
  edited_by_teacher: boolean;
  teacher_edit_count: number;
  queued_at_ms: number | null;
  started_at_ms: number | null;
  completed_at_ms: number | null;
  uploaded_at_ms: number | string;
  draft: unknown;
  failure_code: string | null;
}


export interface ClassListOptions {
  teacherId: string;
  query: ClassListQuery;
}

export interface StudentListOptions {
  teacherId: string;
  classId: string;
  query: StudentListQuery;
}

export interface AssignmentListOptions {
  teacherId: string;
  classId: string;
  query: AssignmentListQuery;
}

export interface SubmissionListOptions {
  teacherId: string;
  assignmentId: string;
  query: SubmissionListQuery;
}

export interface MaterialVersionListOptions {
  teacherId: string;
  assignmentId: string;
  page: number;
}

export interface ProcessingListOptions {
  teacherId: string;
  documentType: 'materials' | 'submission';
  documentId: string;
  query: ProcessingListQuery;
}

export interface PageImageDeliveryRow {
  id: string;
  storage_key: string;
  teacher_id: string;
  class_id: string;
  assignment_id: string;
  document_type: 'materials' | 'submission';
}

/** One pending-or-just-accepted cross-store deletion job (REQ-022). */
export interface DeletionOperationRow {
  id: string;
  target_type: string;
  target_id: string;
  status: 'pending' | 'completed' | 'failed';
  accepted_at_ms: number | string;
}

export interface CreateDeletionOperationInput {
  teacherId: string;
  targetType: 'page';
  targetId: string;
  storageKeys: string[];
}

/** Domain errors mapped to the API error envelope by the controller. */
export type AssignmentReaderErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_MULTIPART'
  | 'UNSUPPORTED_IMAGE'
  | 'IMAGE_TOO_LARGE'
  | 'PAGE_LIMIT_EXCEEDED'
  | 'DUPLICATE_PAGE'
  | 'RESOURCE_NOT_FOUND'
  | 'ARCHIVED_ANCESTRY'
  | 'HISTORICAL_VERSION_READ_ONLY'
  | 'INVALID_STATE'
  | 'REVISION_CONFLICT'
  | 'CONSENT_REQUIRED'
  | 'SCORE_EXCEEDS_MAXIMUM'
  | 'QUEUE_DELIVERY_FAILED';

export interface AssignmentReaderHttpError extends Error {
  readonly status: number;
  readonly code: AssignmentReaderErrorCode;
  readonly details?: Array<{ path: string; message: string }>;
}
