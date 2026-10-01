import postgres from 'postgres';
import type { Sql } from '../lib/db';
import type {
  AssignmentListItem,
  AssignmentRecord,
  AssignmentStatus,
  ClassRecord,
  ClassStatus,
  DeletionTargetType,
  GradingState,
  ListResponse,
  MaterialVersionLifecycle,
  MaterialVersionSummary,
  ProcessingPageItem,
  ProcessingState,
  ReviewState,
  SavedSeatingChart,
  SeatingChartListQuery,
  StudentRecord,
  StudentStatus,
  SubmissionCounts,
  SubmissionListItem,
  SubmissionListStatus,
  SubmissionRecord,
  SafeFailure,
} from '@classprints/assignment-reader-shared';
import {
  canEditGradingDraft,
  canMarkGraded,
  computeAssignmentStatus,
  computeDocumentProcessingState,
  computeProcessingCounts,
} from '@classprints/assignment-reader-shared';
import type {
  AssignmentListOptions,
  AssignmentRow,
  ApplyQuestionPointsOutcome,
  ClassListOptions,
  ClassRow,
  ConfirmDocumentOrderResult,
  CreateDeletionOperationInput,
  DeletionOperationRow,
  DocumentRevisionCommandOutcome,
  DocumentStatusRow,
  GradingDraftRow,
  InsertPageInput,
  InsertPageResult,
  MarkGradedOutcome,
  MaterialVersionListOptions,
  MaterialVersionRow,
  PageImageDeliveryRow,
  PageRow,
  ProcessingListOptions,
  ProcessingPageRow,
  QuestionSegmentWithJudgmentRow,
  RemovePageResultRow,
  ReplacePageInput,
  ReplacePageResultRow,
  RetranscribeDocumentRowsInput,
  RetranscribeDocumentRowsResult,
  RetryPageRowResult,
  ReviewPageOutcome,
  RewriteOrderInput,
  StudentListOptions,
  StudentRow,
  SubmissionListOptions,
  SubmissionRow,
  UpdateGradingDraftOutcome,
  UpdatePageDraftOutcome,
  UpdateQuestionJudgmentOutcome,
} from './assignment-reader.types';
import { DeletionScopeConflictError } from './assignment-reader.types';
/**
 * Assignment Reader repository (TASK-007/TASK-008). Owns all Postgres access
 * for hierarchy, canonical lists, materials, and submissions. Every read and
 * write resolves teacher ownership through teacher_id predicates so opaque IDs
 * alone never authorize access (SEC-001).
 *
 * Canonical lists are server-driven: allow-listed sort fragments, one stable
 * tiebreak (`id asc`; `studentId asc` for submissions per manifest §1.5),
 * fixed pageSize 10, search across exactly the displayed columns, and a
 * window `total_items` count so one query returns the page and the total.
 * List state derivations (processing rollup, review state, assignment
 * aggregate, display status precedence) come from the shared transition
 * functions, never ad-hoc SQL logic (REQ-010/REQ-011/PAT-003).
 */

const PAGE_SIZE = 10;

const toIso = (value: number | string | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  return new Date(Number.isNaN(numeric) ? Date.parse(String(value)) : numeric).toISOString();
};

const toNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const trimSearch = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
};

const likePattern = (search: string): string => `%${search.replace(/[%_\\]/g, (ch) => `\\${ch}`)}%`;
/** Picks the allow-listed order fragment; sort keys outside the table fall
 * back to the declared default. Returns the pre-authored SQL fragment. */
const orderFragment = (
  sorts: Record<string, SortColumn>,
  sort: string | undefined,
  direction: 'asc' | 'desc',
  fallback: string,
): unknown => {
  const column = sort !== undefined && sort in sorts ? sorts[sort] : sorts[fallback];
  return direction === 'desc' ? column.desc : column.asc;
};


const pagination = (page: number, totalItems: number) => ({
  page,
  pageSize: PAGE_SIZE as 10,
  totalItems,
  totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / PAGE_SIZE),
});

const totalItemsOf = (rows: Array<{ total_items: number | string }>): number =>
  rows.length > 0 ? Number(rows[0].total_items) : 0;


// ——— Sort fragment tables (allow-listed, pre-authored identifiers) ——————————
//
// postgres.js fragments bind to the `sql` instance that created them, so the
// per-list tables are factory functions parameterized by the caller's client
// rather than module-level constants.

interface SortColumn {
  asc: unknown;
  desc: unknown;
}

const classSorts = (sql: Sql): Record<string, SortColumn> => ({
  createdAt: { asc: sql`c.created_at_ms asc`, desc: sql`c.created_at_ms desc` },
  name: { asc: sql`lower(btrim(c.name)) asc`, desc: sql`lower(btrim(c.name)) desc` },
  studentCount: { asc: sql`student_count asc`, desc: sql`student_count desc` },
  assignmentCount: { asc: sql`assignment_count asc`, desc: sql`assignment_count desc` },
  status: { asc: sql`c.status asc`, desc: sql`c.status desc` },
});

const studentSorts = (sql: Sql): Record<string, SortColumn> => ({
  createdAt: { asc: sql`s.created_at_ms asc`, desc: sql`s.created_at_ms desc` },
  name: { asc: sql`lower(btrim(s.name)) asc`, desc: sql`lower(btrim(s.name)) desc` },
  status: { asc: sql`s.status asc`, desc: sql`s.status desc` },
});

const assignmentSorts = (sql: Sql): Record<string, SortColumn> => ({
  createdAt: { asc: sql`a.created_at_ms asc`, desc: sql`a.created_at_ms desc` },
  name: { asc: sql`lower(btrim(a.name)) asc`, desc: sql`lower(btrim(a.name)) desc` },
  status: { asc: sql`a.status asc`, desc: sql`a.status desc` },
});

const seatingSorts = (sql: Sql): Record<string, SortColumn> => ({
  createdAt: { asc: sql`g.created_at_ms asc`, desc: sql`g.created_at_ms desc` },
  className: { asc: sql`lower(btrim(c.name)) asc`, desc: sql`lower(btrim(c.name)) desc` },
  studentCount: { asc: sql`g.student_count asc`, desc: sql`g.student_count desc` },
});

/** Submission-list ordering (manifest §1.5): `status` follows the exact
 * SubmissionListStatus rank, `createdAt` places nulls (not-started rows)
 * last in both directions, and every sort ends with `student_id asc`. */
const submissionSorts = (sql: Sql): Record<string, SortColumn> => {
  const statusRank = sql`case r.display_status
    when 'not_started' then 0 when 'uploading' then 1 when 'queued' then 2
    when 'transcribing' then 3 when 'error' then 4 when 'needs_review' then 5
    when 'ready_to_grade' then 6 else 7 end`;
  return {
    createdAt: { asc: sql`r.created_at_ms asc nulls last`, desc: sql`r.created_at_ms desc nulls last` },
    studentName: { asc: sql`lower(btrim(r.student_name)) asc`, desc: sql`lower(btrim(r.student_name)) desc` },
    status: { asc: sql`${statusRank} asc`, desc: sql`${statusRank} desc` },
  };
};

/** Processing-list ordering (api-routes-documents.md §3.1): `processingState`
 * follows the REQ-010 rollup precedence so failed pages surface first;
 * `uploadedAt` is the route's declared default (`direction=asc`). */
const processingSorts = (sql: Sql): Record<string, SortColumn> => {
  const stateRank = sql`case p.processing_state
    when 'failed' then 0 when 'uploading' then 1 when 'transcribing' then 2
    when 'queued' then 3 else 4 end`;
  return {
    uploadedAt: { asc: sql`p.uploaded_at_ms asc`, desc: sql`p.uploaded_at_ms desc` },
    label: { asc: sql`lower(btrim(p.label)) asc`, desc: sql`lower(btrim(p.label)) desc` },
    processingState: { asc: sql`${stateRank} asc`, desc: sql`${stateRank} desc` },
  };
};


// ——— Row mappers —————————————————————————————————————————————————————————————

export interface ClassCountRow {
  student_count: number;
  assignment_count: number;
}

export interface SeatingChartRow {
  id: string;
  class_id: string;
  teacher_id: string;
  source_job_external_id: string;
  source_result_id: number | string;
  grid: unknown;
  student_count: number;
  created_at_ms: number | string;
  class_name?: string;
}

export type SavedChartGrid = Array<Array<string | null>>;

export interface SaveSeatingChartInput {
  teacherId: string;
  classId: string;
  sourceJobExternalId: string;
  sourceResultId: number;
  grid: SavedChartGrid;
  studentCount: number;
}

const mapClassRecord = (row: ClassRow & ClassCountRow): ClassRecord => ({
  id: row.id,
  name: row.name,
  status: row.status as ClassStatus,
  studentCount: row.student_count,
  assignmentCount: row.assignment_count,
  createdAt: toIso(row.created_at_ms) as string,
  updatedAt: toIso(row.updated_at_ms) as string,
  archivedAt: toIso(row.archived_at_ms),
});

const mapStudentRecord = (row: StudentRow): StudentRecord => ({
  id: row.id,
  classId: row.class_id,
  name: row.name,
  status: row.status as StudentStatus,
  createdAt: toIso(row.created_at_ms) as string,
  updatedAt: toIso(row.updated_at_ms) as string,
  removedAt: toIso(row.removed_at_ms),
});

const mapAssignmentListItem = (row: AssignmentRow): AssignmentListItem => ({
  id: row.id,
  classId: row.class_id,
  name: row.name,
  status: row.status as AssignmentStatus,
  maxScore: toNumber(row.max_score),
  createdAt: toIso(row.created_at_ms) as string,
  updatedAt: toIso(row.updated_at_ms) as string,
});

const mapSavedSeatingChart = (row: SeatingChartRow): SavedSeatingChart => ({
  id: row.id,
  classId: row.class_id,
  className: row.class_name ?? '',
  sourceJobExternalId: row.source_job_external_id,
  sourceResultId: toNumber(row.source_result_id) ?? 0,
  grid: row.grid as SavedChartGrid,
  studentCount: row.student_count,
  createdAt: toIso(row.created_at_ms) as string,
});

interface MaterialVersionPageAggregate {
  page_count: number | string;
  page_states: string[] | null;
}

const mapMaterialVersionSummary = (
  row: MaterialVersionRow & MaterialVersionPageAggregate,
): MaterialVersionSummary => {
  const states = (row.page_states ?? []) as ProcessingState[];
  const counts = computeProcessingCounts(states);
  // `review_state` is authoritative (REQ-011/REQ-016): every page-set,
  // draft-edit, retry/retranscribe, review, mark-ready, and
  // return-to-needs-review write maintains it directly, including
  // 'ready_to_grade' — a value `computeDocumentReviewState` cannot derive
  // from page states alone, since readiness is an explicit teacher action.
  const reviewState = (row.review_state as ReviewState | null) ?? null;
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    version: row.version,
    lifecycle: row.lifecycle as MaterialVersionLifecycle,
    pageCount: Number(row.page_count),
    processingState: computeDocumentProcessingState(states),
    processingCounts: counts,
    reviewState,
    documentRevision: row.document_revision,
    createdAt: toIso(row.created_at_ms) as string,
    confirmedAt: toIso(row.confirmed_at_ms),
    replacedAt: toIso(row.replaced_at_ms),
    readOnly: row.lifecycle === 'historical',
  };
};

const failureOf = (row: ProcessingPageRow): SafeFailure | null => {
  const code = row.failure_code;
  if (!code) return null;
  // REQ-014: teacher-facing guidance only; never a provider payload.
  const guidance: Record<string, { message: string; retryAllowed: boolean; replacementRecommended: boolean }> = {
    provider_timeout: { message: 'Transcription timed out; retry this page.', retryAllowed: true, replacementRecommended: false },
    provider_rejected: { message: 'The transcription provider rejected this page; retry, or replace the page image.', retryAllowed: true, replacementRecommended: true },
    invalid_output: { message: 'Transcription output was invalid; retry this page.', retryAllowed: true, replacementRecommended: false },
    storage_failure: { message: 'The page image could not be stored; replace this page.', retryAllowed: false, replacementRecommended: true },
    invalid_image: { message: 'The page image is not a supported image; replace this page.', retryAllowed: false, replacementRecommended: true },
  };
  const safe = guidance[code];
  return safe ? { code: code as SafeFailure['code'], ...safe } : null;
};

const documentIdOf = (row: ProcessingPageRow): string =>
  row.document_type === 'materials' ? row.materials_version_id ?? '' : row.submission_id ?? '';

const mapProcessingPageItem = (
  row: ProcessingPageRow,
  nowMs: number,
): ProcessingPageItem => {
  const draftAvailable = row.processing_state === 'completed' && row.draft !== null;
  return {
    id: row.id,
    documentType: row.document_type,
    documentId: documentIdOf(row),
    position: row.position,
    label: row.label,
    processingState: row.processing_state,
    attemptCount: row.attempt_count,
    queuedAt: toIso(row.queued_at_ms),
    startedAt: toIso(row.started_at_ms),
    completedAt: toIso(row.completed_at_ms),
    uploadedAt: toIso(row.uploaded_at_ms) as string,
    failure: failureOf(row),
    draftAvailable,
    pageRevision: row.page_revision,
    contentRevision: row.content_revision,
    reviewedContentRevision: row.reviewed_content_revision,
    editedByTeacher: row.edited_by_teacher,
    teacherEditCount: row.teacher_edit_count,
    elapsedFromQueuedMs:
      row.queued_at_ms === null
        ? null
        : Math.max(nowMs - Number(row.queued_at_ms), 0),
    // Completed pages link into the workspace; other states expose none.
    workspacePath: draftAvailable
      ? `/classes/assignments/${documentIdOf(row)}/workspace?pageId=${row.id}`
      : null,
  };
};


export interface AssignmentReaderRepository {
  // Classes
  listClasses(options: ClassListOptions): Promise<ListResponse<ClassRecord>>;
  findClass(teacherId: string, classId: string): Promise<ClassRecord | null>;
  createClass(teacherId: string, name: string): Promise<ClassRecord>;
  updateClass(
    teacherId: string,
    classId: string,
    patch: { name?: string; status?: 'archived' },
  ): Promise<ClassRecord | null>;
  // Students
  listStudents(options: StudentListOptions): Promise<ListResponse<StudentRecord>>;
  findStudent(teacherId: string, studentId: string): Promise<StudentRecord | null>;
  createStudent(teacherId: string, classId: string, name: string): Promise<StudentRecord>;
  updateStudent(teacherId: string, studentId: string, name: string): Promise<StudentRecord | null>;
  removeStudent(teacherId: string, studentId: string): Promise<StudentRecord | null>;
  // Assignments
  listAssignments(options: AssignmentListOptions): Promise<ListResponse<AssignmentListItem>>;
  findAssignment(teacherId: string, assignmentId: string): Promise<AssignmentRecord | null>;
  createAssignment(
    teacherId: string,
    classId: string,
    name: string,
    maxScore: number | null,
  ): Promise<AssignmentRecord>;
  updateAssignment(
    teacherId: string,
    assignmentId: string,
    patch: { name?: string; maxScore?: number | null },
  ): Promise<AssignmentRecord | null>;
  countSubmissionsAboveScore(teacherId: string, assignmentId: string, score: number): Promise<number>;
  refreshAssignmentStatus(teacherId: string, assignmentId: string): Promise<AssignmentStatus>;
  // Materials
  listMaterialVersions(options: MaterialVersionListOptions): Promise<ListResponse<MaterialVersionSummary>>;
  findMaterialVersion(teacherId: string, materialVersionId: string): Promise<MaterialVersionSummary | null>;
  findCurrentMaterialVersion(teacherId: string, assignmentId: string): Promise<MaterialVersionSummary | null>;
  createDraftMaterialVersion(teacherId: string, assignmentId: string): Promise<MaterialVersionSummary | null>;
  findDraftMaterialVersion(teacherId: string, assignmentId: string): Promise<MaterialVersionSummary | null>;
  promoteDraftMaterials(teacherId: string, materialVersionId: string): Promise<void>;
  // Pages (TASK-010/TASK-011)
  findDocumentStatus(
    teacherId: string,
    documentType: 'materials' | 'submission',
    documentId: string,
  ): Promise<DocumentStatusRow | null>;
  findPage(teacherId: string, pageId: string): Promise<PageRow | null>;
  listDocumentPageRows(
    teacherId: string,
    documentType: 'materials' | 'submission',
    documentId: string,
  ): Promise<PageRow[]>;
  countDocumentPages(
    teacherId: string,
    documentType: 'materials' | 'submission',
    documentId: string,
  ): Promise<number>;
  insertPageRow(input: InsertPageInput): Promise<InsertPageResult>;
  // Ordering, confirmation, removal, replacement (TASK-011)
  confirmDocumentOrder(input: RewriteOrderInput): Promise<ConfirmDocumentOrderResult>;
  listQueuedUndeliveredPages(
    teacherId: string,
    documentType: 'materials' | 'submission',
    documentId: string,
  ): Promise<PageRow[]>;
  replacePageRow(input: ReplacePageInput): Promise<ReplacePageResultRow>;
  removePageRow(teacherId: string, pageId: string): Promise<RemovePageResultRow | null>;
  findPageImageSource(teacherId: string, pageId: string): Promise<PageImageDeliveryRow | null>;
  createDeletionOperation(input: CreateDeletionOperationInput): Promise<DeletionOperationRow>;
  findPendingDeletionOperation(
    teacherId: string,
    targetType: DeletionTargetType,
    targetId: string,
  ): Promise<DeletionOperationRow | null>;
  // Processing (TASK-008): per-page canonical list for one document.
  listProcessing(options: ProcessingListOptions): Promise<ListResponse<ProcessingPageItem>>;
  // Retry and retranscription (TASK-015)
  retryPageRow(teacherId: string, pageId: string): Promise<RetryPageRowResult | null>;
  retranscribeDocumentRows(
    input: RetranscribeDocumentRowsInput,
  ): Promise<RetranscribeDocumentRowsResult | null>;
  /** Whether any judgment currently exists on a current (live page-revision)
   * segment of this submission (api-routes-documents.md §3.4 consent gate).
   * Materials never have judgments. */
  hasCurrentQuestionJudgments(teacherId: string, submissionId: string): Promise<boolean>;

  // ——— Workspace, review, and grading (TASK-016/TASK-017) ———————————————————
  listCurrentQuestionSegments(
    teacherId: string,
    pageId: string,
  ): Promise<QuestionSegmentWithJudgmentRow[]>;
  /** All current question segments across every current page of a
   * submission, ordered by page position then segment ordinal — the
   * document-wide list `GradingDraft.questionJudgments` needs (unlike
   * `listCurrentQuestionSegments`, which is scoped to one page's workspace). */
  listSubmissionQuestionSegments(
    teacherId: string,
    submissionId: string,
  ): Promise<QuestionSegmentWithJudgmentRow[]>;
  updatePageDraftRow(input: {
    teacherId: string;
    pageId: string;
    draft: unknown;
    expectedContentRevision: number;
  }): Promise<UpdatePageDraftOutcome>;
  reviewPageRow(input: {
    teacherId: string;
    pageId: string;
    expectedContentRevision: number;
  }): Promise<ReviewPageOutcome>;
  markDocumentReadyRow(input: {
    teacherId: string;
    documentType: 'materials' | 'submission';
    documentId: string;
    expectedDocumentRevision: number;
  }): Promise<DocumentRevisionCommandOutcome>;
  returnToNeedsReviewRow(input: {
    teacherId: string;
    documentType: 'materials' | 'submission';
    documentId: string;
    expectedDocumentRevision: number;
  }): Promise<DocumentRevisionCommandOutcome>;
  updateQuestionJudgmentRow(input: {
    teacherId: string;
    pageId: string;
    segmentId: string;
    expectedPageRevision: number;
    judgment: 'unmarked' | 'correct' | 'incorrect';
    awardedPoints: number | null;
    comment: string | null;
  }): Promise<UpdateQuestionJudgmentOutcome>;
  updateGradingDraftRow(input: {
    teacherId: string;
    submissionId: string;
    expectedDocumentRevision: number;
    scoreProvided: boolean;
    score: number | null;
    commentsProvided: boolean;
    comments: string | null;
  }): Promise<UpdateGradingDraftOutcome>;
  getQuestionPointsTotalRow(
    teacherId: string,
    submissionId: string,
  ): Promise<{
    documentRevision: number;
    segments: Array<{
      id: string;
      ordinal: number;
      label: string | null;
      questionText: string | null;
      awardedPoints: string | number | null;
    }>;
  } | null>;
  applyQuestionPointsToScoreRow(input: {
    teacherId: string;
    submissionId: string;
    expectedDocumentRevision: number;
    expectedTotal: number;
  }): Promise<ApplyQuestionPointsOutcome>;
  markSubmissionGradedRow(input: {
    teacherId: string;
    submissionId: string;
    expectedDocumentRevision: number;
  }): Promise<MarkGradedOutcome>;

  // ——— Deletion scopes (TASK-018) ——————————————————————————————————————————
  listStorageKeysForMaterialsScope(teacherId: string, assignmentId: string): Promise<string[]>;
  listStorageKeysForSubmissionScope(teacherId: string, submissionId: string): Promise<string[]>;
  listStorageKeysForStudentDataScope(teacherId: string, studentId: string): Promise<string[]>;
  listStorageKeysForAssignmentScope(teacherId: string, assignmentId: string): Promise<string[]>;
  listStorageKeysForClassScope(teacherId: string, classId: string): Promise<string[]>;
  listStorageKeysForAccountScope(teacherId: string): Promise<string[]>;

  // Submissions
  listSubmissions(options: SubmissionListOptions): Promise<ListResponse<SubmissionListItem>>;
  findSubmission(teacherId: string, submissionId: string): Promise<SubmissionRecord | null>;
  createSubmission(
    teacherId: string,
    assignmentId: string,
    studentId: string,
  ): Promise<{ submission: SubmissionRecord; created: boolean }>;
  // Seating charts (TASK-009)
  listSavedSeatingCharts(
    teacherId: string,
    classId: string,
    query: SeatingChartListQuery,
  ): Promise<ListResponse<SavedSeatingChart>>;
  findSavedSeatingChart(teacherId: string, chartId: string): Promise<SavedSeatingChart | null>;
  findSavedSeatingChartByJob(
    teacherId: string,
    classId: string,
    sourceJobExternalId: string,
  ): Promise<SavedSeatingChart | null>;
  saveSeatingChart(input: SaveSeatingChartInput): Promise<SavedSeatingChart>;
  findSeatingJobByExternalId(
    teacherId: string,
    externalId: string,
  ): Promise<{ id: string; externalId: string } | null>;
  findSeatingResult(
    jobId: string,
    resultId: number,
  ): Promise<{ id: number; arrangement: SavedChartGrid } | null>;
}

export const createAssignmentReaderRepository = (sql: Sql): AssignmentReaderRepository => {
  /**
   * Pre-authored per-alias fragments: the alias is a fixed call-site
   * constant, never request input, so interpolation stays allow-listed.
   *
   * TASK-018: a scope delete (materials/submission/student_data/assignment/
   * class) creates exactly one `deletion_operations` row whose `target_id` is
   * the SCOPE's own id (e.g. the assignment id for a "delete all materials"
   * command — see `deleteScopeRelationalRows` in
   * apps/assignment-worker/src/db/deletion.repository.ts), not a row per
   * descendant. For every descendant to "immediately disappear from every
   * non-delete route" (api-routes-documents.md §"Shared state and revision
   * rules") before physical cleanup finishes, every read must check its own
   * id AND every ancestor id that could carry a pending scope deletion.
   *
   * `materials` and `assignment` scopes both use the ASSIGNMENT's own id as
   * `target_id` (there is no separate "materials" id), so matching an
   * ancestor id alone is not enough to tell the two scopes apart — a pending
   * materials-only delete must hide the materials version and its pages
   * without also hiding the assignment row, its submissions, or submission
   * pages. Every branch below therefore pairs each candidate id with the
   * `target_type`(s) that are actually allowed to carry it, instead of
   * matching `target_id` against the id alone. Account-scope deletion is
   * deliberately excluded: it revokes the teacher's session in the same
   * request that accepts it, so every later request 401s before reaching
   * these reads.
   */
  const notDeletionPending = (alias: 'c' | 's' | 'a' | 'v' | 'sb', teacherId: string) => {
    switch (alias) {
      case 'c':
        return sql`and not exists (
          select 1 from deletion_operations d
          where d.teacher_id = ${teacherId} and d.status = 'pending'
            and d.target_type = 'class' and d.target_id = c.id
        )`;
      case 's':
        return sql`and not exists (
          select 1 from deletion_operations d
          where d.teacher_id = ${teacherId} and d.status = 'pending'
            and (
              (d.target_type = 'student_data' and d.target_id = s.id)
              or (d.target_type = 'class' and d.target_id = s.class_id)
            )
        )`;
      case 'a':
        return sql`and not exists (
          select 1 from deletion_operations d
          where d.teacher_id = ${teacherId} and d.status = 'pending'
            and (
              (d.target_type = 'assignment' and d.target_id = a.id)
              or (d.target_type = 'class' and d.target_id = a.class_id)
            )
        )`;
      case 'v':
        return sql`and not exists (
          select 1 from deletion_operations d
          where d.teacher_id = ${teacherId} and d.status = 'pending'
            and (
              (d.target_type in ('materials', 'assignment') and d.target_id = v.assignment_id)
              or (d.target_type = 'class'
                  and d.target_id = (select class_id from assignments where id = v.assignment_id))
            )
        )`;
      case 'sb':
        return sql`and not exists (
          select 1 from deletion_operations d
          where d.teacher_id = ${teacherId} and d.status = 'pending'
            and (
              (d.target_type = 'submission' and d.target_id = sb.id)
              or (d.target_type = 'student_data' and d.target_id = sb.student_id)
              or (d.target_type = 'assignment' and d.target_id = sb.assignment_id)
              or (d.target_type = 'class' and d.target_id = sb.class_id)
            )
        )`;
    }
  };

  /** Pages are owned by exactly one parent document (`materials_version_id`
   * xor `submission_id`); this guards a page-level read/write against the
   * page's own id or any ancestor (class/assignment/submission/student)
   * carrying a pending scope deletion — see `notDeletionPending`'s doc
   * comment for why each id must be paired with its `target_type`(s). A
   * `materials`-scope delete shares the assignment's own id with the
   * `assignment` scope, so it only matches pages that actually belong to a
   * materials version (`materials_version_id is not null`); a submission's
   * pages share `assignment_id` too but are unaffected by a materials-only
   * delete. `pages` denormalizes `class_id`/`assignment_id` directly, so no
   * join is needed to reach them. */
  const notDeletionPendingParent = (teacherId: string) => sql`
    and not exists (
      select 1 from deletion_operations d
      where d.teacher_id = ${teacherId} and d.status = 'pending'
        and (
          (d.target_type = 'page' and d.target_id = p.id)
          or (d.target_type = 'class' and d.target_id = p.class_id)
          or (d.target_type = 'assignment' and d.target_id = p.assignment_id)
          or (d.target_type = 'materials' and d.target_id = p.assignment_id
              and p.materials_version_id is not null)
          or (d.target_type = 'submission' and d.target_id = p.submission_id)
          or (d.target_type = 'student_data' and d.target_id = p.student_id)
        )
    )
  `;

  /** Full page column list shared by every single/multi-row page read and
   * write-returning clause (TASK-010/TASK-011). */
  const pageColumns = (client: Sql) => client`
    id, document_type, materials_version_id, submission_id, student_id,
    class_id, assignment_id, teacher_id, position, label, storage_key,
    processing_state, attempt_count, page_revision, content_revision,
    reviewed_content_revision, reviewed_at_ms, edited_by_teacher,
    teacher_edit_count, draft, failure_code, failure_message, queued_at_ms,
    started_at_ms, completed_at_ms, uploaded_at_ms, created_at_ms, updated_at_ms
  `;

  const materialVersionSelect = () => sql`
    v.id, v.assignment_id, v.teacher_id, v.version, v.lifecycle,
    v.document_revision, v.draft_confirmed, v.confirmed_at_ms, v.replaced_at_ms,
    v.review_state, v.created_at_ms, v.updated_at_ms,
    (select count(*)::int from pages p where p.materials_version_id = v.id) as page_count,
    (select coalesce(jsonb_agg(p.processing_state order by p.position), '[]'::jsonb)
     from pages p where p.materials_version_id = v.id) as page_states
  `;

  const repo: AssignmentReaderRepository = {
    // ——— Pages (TASK-010/TASK-011) ——————————————————————————————————————————

    async findDocumentStatus(teacherId, documentType, documentId) {
      const rows =
        documentType === 'materials'
          ? await sql<DocumentStatusRow[]>`
            select 'materials' as document_type,
                   v.id as document_id,
                   v.document_revision,
                   v.draft_confirmed,
                   a.class_id,
                   a.id as assignment_id,
                   null::uuid as student_id,
                   c.status as class_status,
                   null::text as student_name,
                   v.lifecycle
            from assignment_material_versions v
            join assignments a on a.id = v.assignment_id and a.teacher_id = v.teacher_id
            join classes c on c.id = a.class_id and c.teacher_id = a.teacher_id
            where v.teacher_id = ${teacherId} and v.id = ${documentId}
              ${notDeletionPending('v', teacherId)}
            limit 1
          `
          : await sql<DocumentStatusRow[]>`
            select 'submission' as document_type,
                   sb.id as document_id,
                   sb.document_revision,
                   sb.draft_confirmed,
                   sb.class_id,
                   sb.assignment_id,
                   sb.student_id,
                   c.status as class_status,
                   st.name as student_name,
                   null::text as lifecycle
            from submissions sb
            join assignments a on a.id = sb.assignment_id and a.teacher_id = sb.teacher_id
            join classes c on c.id = sb.class_id and c.teacher_id = sb.teacher_id
            join students st on st.id = sb.student_id and st.teacher_id = sb.teacher_id
            where sb.teacher_id = ${teacherId} and sb.id = ${documentId}
              ${notDeletionPending('sb', teacherId)}
            limit 1
          `;
      return rows[0] ?? null;
    },

    async findPage(teacherId, pageId) {
      const rows = await sql<PageRow[]>`
        select p.id, p.document_type, p.materials_version_id, p.submission_id,
               p.student_id, p.class_id, p.assignment_id, p.teacher_id,
               p.position, p.label, p.storage_key, p.processing_state,
               p.attempt_count, p.page_revision, p.content_revision,
               p.reviewed_content_revision, p.reviewed_at_ms, p.edited_by_teacher,
               p.teacher_edit_count, p.draft, p.failure_code, p.failure_message,
               p.queued_at_ms, p.started_at_ms, p.completed_at_ms,
               p.uploaded_at_ms, p.created_at_ms, p.updated_at_ms
        from pages p
        where p.teacher_id = ${teacherId} and p.id = ${pageId}
          ${notDeletionPendingParent(teacherId)}
        limit 1
      `;
      return rows[0] ?? null;
    },

    async listDocumentPageRows(teacherId, documentType, documentId) {
      const parentCondition =
        documentType === 'materials'
          ? sql`p.materials_version_id = ${documentId}`
          : sql`p.submission_id = ${documentId}`;
      const rows = await sql<PageRow[]>`
        select p.id, p.document_type, p.materials_version_id, p.submission_id,
               p.student_id, p.class_id, p.assignment_id, p.teacher_id,
               p.position, p.label, p.storage_key, p.processing_state,
               p.attempt_count, p.page_revision, p.content_revision,
               p.reviewed_content_revision, p.reviewed_at_ms, p.edited_by_teacher,
               p.teacher_edit_count, p.draft, p.failure_code, p.failure_message,
               p.queued_at_ms, p.started_at_ms, p.completed_at_ms,
               p.uploaded_at_ms, p.created_at_ms, p.updated_at_ms
        from pages p
        where p.teacher_id = ${teacherId} and ${parentCondition}
        order by p.position asc, p.id asc
      `;
      return rows;
    },
    async countDocumentPages(teacherId, documentType, documentId) {
      const parentCondition =
        documentType === 'materials'
          ? sql`p.materials_version_id = ${documentId}`
          : sql`p.submission_id = ${documentId}`;
      const rows = await sql<({ count: number })[]>`
        select count(*)::int as count from pages p
        where p.teacher_id = ${teacherId} and ${parentCondition}
      `;
      return Number(rows[0]?.count ?? 0);
    },


    // Full page column list shared by every single-row page read/write below.
    async insertPageRow(input) {
      const now = Date.now();
      const isMaterials = input.documentType === 'materials';
      return sql.begin(async (tx) => {
        // Lock the parent document row so concurrent one-page uploads to the
        // same document serialize instead of racing the 20-page boundary.
        if (isMaterials) {
          await tx`select id from assignment_material_versions where id = ${input.materialsVersionId} for update`;
        } else {
          await tx`select id from submissions where id = ${input.submissionId} for update`;
        }
        const parentCondition = isMaterials
          ? tx`materials_version_id = ${input.materialsVersionId}`
          : tx`submission_id = ${input.submissionId}`;
        const countRows = await tx<({ count: number })[]>`
          select count(*)::int as count from pages
          where teacher_id = ${input.teacherId} and ${parentCondition}
        `;
        const count = Number(countRows[0]?.count ?? 0);
        if (count >= 20) return null; // caller compensates by deleting the R2 object
        const position = count + 1;
        const label = `${input.ownerLabel} · Page ${position}`;
        const rows = await tx<PageRow[]>`
          insert into pages (
            id, document_type, materials_version_id, submission_id, student_id,
            class_id, assignment_id, teacher_id, position, label, storage_key,
            processing_state, attempt_count, page_revision, content_revision,
            created_at_ms, updated_at_ms, uploaded_at_ms
          ) values (
            ${input.id}, ${input.documentType}, ${input.materialsVersionId}, ${input.submissionId},
            ${input.studentId}, ${input.classId}, ${input.assignmentId}, ${input.teacherId},
            ${position}, ${label}, ${input.storageKey}, 'uploading', 0, 1, 0,
            ${now}, ${now}, ${now}
          )
          returning ${pageColumns(tx)}
        `;
        const row = rows[0];
        if (!row) throw new Error('Unable to insert page');
        // Uploading a page changes the current ordered page set, so
        // documentRevision increments exactly once for this mutation
        // (api-routes-documents.md §2.1/§2.2).
        if (isMaterials) {
          await tx`
            update assignment_material_versions set
              document_revision = document_revision + 1, review_state = null, updated_at_ms = ${now}
            where id = ${input.materialsVersionId} and teacher_id = ${input.teacherId}
          `;
        } else {
          // Appending a page after an earlier confirmation invalidates it
          // (api-routes-documents.md §2.2); materials pages only ever upload
          // while the version is still an unconfirmed draft, so no analogous
          // reset is needed there.
          await tx`
            update submissions set
              document_revision = document_revision + 1,
              draft_confirmed = false, confirmed_at_ms = null, review_state = null,
              grading_state = 'not_graded', graded_at_ms = null, updated_at_ms = ${now}
            where id = ${input.submissionId}
          `;
        }
        return row;
      });
    },

    async confirmDocumentOrder({ teacherId, documentType, documentId, orderedPageIds, orderChanged }) {
      const now = Date.now();
      const isMaterials = documentType === 'materials';
      return sql.begin(async (tx) => {
        const parentConditionTx = isMaterials
          ? tx`materials_version_id = ${documentId}`
          : tx`submission_id = ${documentId}`;
        // Two-pass position rewrite: a single-statement permutation of a
        // unique (parent, position) column can collide mid-statement
        // (Postgres checks non-deferred unique indexes per row, not at
        // statement end), so every page first moves to a disjoint temporary
        // range before landing on its final position.
        await tx`
          update pages p set position = (v.ordinality::int + 1000), updated_at_ms = ${now}
          from unnest(${orderedPageIds}::uuid[]) with ordinality as v(id, ordinality)
          where p.id = v.id and p.teacher_id = ${teacherId} and p.${parentConditionTx}
        `;
        await tx`
          update pages p set position = v.ordinality::int, updated_at_ms = ${now}
          from unnest(${orderedPageIds}::uuid[]) with ordinality as v(id, ordinality)
          where p.id = v.id and p.teacher_id = ${teacherId} and p.position = (v.ordinality::int + 1000)
        `;
        const queuedRows = await tx<({ id: string; page_revision: number })[]>`
          update pages set processing_state = 'queued', queued_at_ms = ${now}, updated_at_ms = ${now}
          where teacher_id = ${teacherId} and id = any(${orderedPageIds}::uuid[]) and processing_state = 'uploading'
          returning id, page_revision
        `;
        const bump = orderChanged ? 1 : 0;
        const anyIncomplete = await tx<({ n: number })[]>`
          select count(*)::int as n from pages
          where teacher_id = ${teacherId} and ${parentConditionTx} and processing_state <> 'completed'
        `;
        const allCompleted = Number(anyIncomplete[0]?.n ?? 1) === 0;
        if (isMaterials) {
          // Mirrors the submission branch below: confirming an already fully
          // transcribed page set (e.g. re-confirming after upload/order-only
          // changes) must flip straight to needs_review, not wait on a worker
          // write that will never arrive because every page is already
          // completed (REQ-011).
          await tx`
            update assignment_material_versions set
              draft_confirmed = true, confirmed_at_ms = ${now},
              document_revision = document_revision + ${bump},
              review_state = case when ${allCompleted} then 'needs_review' else null end,
              updated_at_ms = ${now}
            where id = ${documentId} and teacher_id = ${teacherId}
          `;
        } else {
          await tx`
            update submissions set
              draft_confirmed = true, confirmed_at_ms = ${now},
              document_revision = document_revision + ${bump},
              review_state = case when ${allCompleted} then 'needs_review' else null end,
              updated_at_ms = ${now}
            where id = ${documentId} and teacher_id = ${teacherId}
          `;
        }
        const pages = await tx<PageRow[]>`
          select ${pageColumns(tx)} from pages
          where teacher_id = ${teacherId} and ${parentConditionTx}
          order by position asc
        `;
        const revisionRows = isMaterials
          ? await tx<({ document_revision: number })[]>`
              select document_revision from assignment_material_versions
              where id = ${documentId} and teacher_id = ${teacherId}
            `
          : await tx<({ document_revision: number })[]>`
              select document_revision from submissions
              where id = ${documentId} and teacher_id = ${teacherId}
            `;
        return {
          documentRevision: Number(revisionRows[0]?.document_revision ?? 0),
          pages,
          queuedSeeds: queuedRows.map((row) => ({ pageId: row.id, pageRevision: row.page_revision })),
        };
      });
    },

    async listQueuedUndeliveredPages(teacherId, documentType, documentId) {
      const parentCondition =
        documentType === 'materials'
          ? sql`materials_version_id = ${documentId}`
          : sql`submission_id = ${documentId}`;
      const rows = await sql<PageRow[]>`
        select ${pageColumns(sql)} from pages
        where teacher_id = ${teacherId} and ${parentCondition}
          and processing_state = 'queued' and attempt_count = 0
        order by position asc
      `;
      return rows;
    },

    async replacePageRow(input) {
      const now = Date.now();
      const isMaterials = input.documentType === 'materials';
      return sql.begin(async (tx) => {
        const oldRows = await tx<({ storage_key: string })[]>`
          select storage_key from pages where teacher_id = ${input.teacherId} and id = ${input.replacedPageId}
          for update
        `;
        const replacedStorageKey = oldRows[0]?.storage_key;
        if (!replacedStorageKey) throw new Error('Replaced page not found');
        // The old row is removed in the same transaction as the new row is
        // inserted at its position: the (parent, position) unique index
        // cannot otherwise hold two rows at the same position (the row
        // itself — not its R2 object — is never left for async cleanup).
        await tx`delete from pages where teacher_id = ${input.teacherId} and id = ${input.replacedPageId}`;
        const processingState = input.requeueImmediately ? 'queued' : 'uploading';
        const queuedAt = input.requeueImmediately ? now : null;
        const rows = await tx<PageRow[]>`
          insert into pages (
            id, document_type, materials_version_id, submission_id, student_id,
            class_id, assignment_id, teacher_id, position, label, storage_key,
            processing_state, attempt_count, page_revision, content_revision,
            queued_at_ms, created_at_ms, updated_at_ms, uploaded_at_ms
          ) values (
            ${input.id}, ${input.documentType}, ${input.materialsVersionId}, ${input.submissionId},
            ${input.studentId}, ${input.classId}, ${input.assignmentId}, ${input.teacherId},
            ${input.position}, ${input.label}, ${input.storageKey}, ${processingState}, 0,
            ${input.pageRevision}, 0, ${queuedAt}, ${now}, ${now}, ${now}
          )
          returning ${pageColumns(tx)}
        `;
        const row = rows[0];
        if (!row) throw new Error('Unable to insert replacement page');
        if (isMaterials) {
          const docRows = await tx<({ document_revision: number })[]>`
            update assignment_material_versions set
              document_revision = document_revision + 1, review_state = null, updated_at_ms = ${now}
            where id = ${input.materialsVersionId} and teacher_id = ${input.teacherId}
            returning document_revision
          `;
          return { page: row, documentRevision: Number(docRows[0]?.document_revision ?? 0), replacedStorageKey };
        }
        // requeueImmediately=true means the replaced page was `failed`
        // (recovery of an already-confirmed submission), so draft_confirmed
        // is left as-is rather than forced true: a newer sibling page can
        // have reset it to false (addPageRow) while this page failed, and
        // forcing it back to true here would strand that sibling in
        // 'uploading' forever, since confirmDocument() 409s once
        // draft_confirmed is already true. requeueImmediately=false (the
        // replaced page was `uploading`) always forces it false, matching
        // the already-unconfirmed state that implies.
        const docRows = await tx<({ document_revision: number })[]>`
          update submissions set
            document_revision = document_revision + 1,
            draft_confirmed = draft_confirmed and ${input.requeueImmediately},
            confirmed_at_ms = case when draft_confirmed and ${input.requeueImmediately} then confirmed_at_ms else null end,
            review_state = null,
            grading_state = 'not_graded', graded_at_ms = null, updated_at_ms = ${now}
          where id = ${input.submissionId} and teacher_id = ${input.teacherId}
          returning document_revision
        `;
        return { page: row, documentRevision: Number(docRows[0]?.document_revision ?? 0), replacedStorageKey };
      });
    },

    async removePageRow(teacherId, pageId) {
      const now = Date.now();
      return sql.begin(async (tx) => {
        const pageRows = await tx<PageRow[]>`
          select ${pageColumns(tx)} from pages where teacher_id = ${teacherId} and id = ${pageId} for update
        `;
        const page = pageRows[0];
        if (!page) return null;
        const isMaterials = page.document_type === 'materials';
        const parentConditionTx = isMaterials
          ? tx`materials_version_id = ${page.materials_version_id}`
          : tx`submission_id = ${page.submission_id}`;
        await tx`delete from pages where teacher_id = ${teacherId} and id = ${pageId}`;
        // Compact trailing positions down by one via a disjoint temporary
        // range first (same collision hazard as confirmDocumentOrder).
        await tx`
          update pages set position = position + 1000, updated_at_ms = ${now}
          where teacher_id = ${teacherId} and ${parentConditionTx} and position > ${page.position}
        `;
        await tx`
          update pages set position = position - 1001, updated_at_ms = ${now}
          where teacher_id = ${teacherId} and ${parentConditionTx} and position > 1000
        `;
        if (isMaterials) {
          const docRows = await tx<({ document_revision: number })[]>`
            update assignment_material_versions set
              document_revision = document_revision + 1,
              draft_confirmed = false, confirmed_at_ms = null, review_state = null, updated_at_ms = ${now}
            where id = ${page.materials_version_id} and teacher_id = ${teacherId}
            returning document_revision
          `;
          return { documentRevision: Number(docRows[0]?.document_revision ?? 0), removedStorageKey: page.storage_key };
        }
        const docRows = await tx<({ document_revision: number })[]>`
          update submissions set
            document_revision = document_revision + 1,
            draft_confirmed = false, confirmed_at_ms = null, review_state = null,
            grading_state = 'not_graded', graded_at_ms = null, updated_at_ms = ${now}
          where id = ${page.submission_id} and teacher_id = ${teacherId}
          returning document_revision
        `;
        return { documentRevision: Number(docRows[0]?.document_revision ?? 0), removedStorageKey: page.storage_key };
      });
    },

    async findPageImageSource(teacherId, pageId) {
      const rows = await sql<PageImageDeliveryRow[]>`
        select p.id, p.storage_key, p.teacher_id, p.class_id, p.assignment_id, p.document_type
        from pages p
        where p.teacher_id = ${teacherId} and p.id = ${pageId}
          ${notDeletionPendingParent(teacherId)}
        limit 1
      `;
      return rows[0] ?? null;
    },

    async findPendingDeletionOperation(teacherId, targetType, targetId) {
      const rows = await sql<DeletionOperationRow[]>`
        select id, target_type, target_id, status, accepted_at_ms
        from deletion_operations
        where teacher_id = ${teacherId} and target_type = ${targetType}
          and target_id = ${targetId} and status = 'pending'
        limit 1
      `;
      return rows[0] ?? null;
    },

    async createDeletionOperation({ teacherId, targetType, targetId, storageKeys }) {
      const now = Date.now();
      try {
        return await sql.begin(async (tx) => {
          const rows = await tx<DeletionOperationRow[]>`
            insert into deletion_operations (teacher_id, target_type, target_id, status, accepted_at_ms, updated_at_ms)
            values (${teacherId}, ${targetType}, ${targetId}, 'pending', ${now}, ${now})
            returning id, target_type, target_id, status, accepted_at_ms
          `;
          const operation = rows[0];
          if (!operation) throw new Error('Unable to create deletion operation');
          for (const storageKey of storageKeys) {
            await tx`
              insert into deletion_objects (operation_id, storage_key, status, attempts, created_at_ms)
              values (${operation.id}, ${storageKey}, 'pending', 0, ${now})
            `;
          }
          return operation;
        });
      } catch (error) {
        // `idx_deletion_operations_pending_target` is unique on `target_id`
        // alone (not `target_id, target_type`): `materials` and `assignment`
        // scopes share the assignment's own id, so a concurrent delete under
        // the other scope hits this unique violation (23505) instead of the
        // `findPendingDeletionOperation` pre-check, which only looks at the
        // SAME `target_type`. Surface it as a typed conflict the service
        // layer can turn into a 409 rather than an unhandled 500.
        if (error instanceof postgres.PostgresError && error.code === '23505') {
          const rows = await sql<DeletionOperationRow[]>`
            select id, target_type, target_id, status, accepted_at_ms
            from deletion_operations
            where teacher_id = ${teacherId} and target_id = ${targetId} and status = 'pending'
            limit 1
          `;
          if (rows[0]) throw new DeletionScopeConflictError(rows[0]);
        }
        throw error;
      }
    },

    async promoteDraftMaterials(teacherId, materialVersionId) {
      const now = Date.now();
      await sql.begin(async (tx) => {
        const versionRows = await tx<({ assignment_id: string; version: number })[]>`
          select assignment_id, version from assignment_material_versions
          where teacher_id = ${teacherId} and id = ${materialVersionId} and lifecycle = 'draft'
          for update
        `;
        const version = versionRows[0];
        if (!version) return;
        await tx`
          update assignment_material_versions set
            lifecycle = 'historical',
            replaced_at_ms = ${now},
            updated_at_ms = ${now}
          where teacher_id = ${teacherId} and assignment_id = ${version.assignment_id}
            and lifecycle = 'current'
        `;
        await tx`
          update assignment_material_versions set
            lifecycle = 'current',
            draft_confirmed = true,
            confirmed_at_ms = ${now},
            updated_at_ms = ${now}
          where teacher_id = ${teacherId} and id = ${materialVersionId}
        `;
      });
    },


    // ——— Classes ————————————————————————————————————————————————————————————

    async listClasses({ teacherId, query }) {
      const page = query.page ?? 1;
      const search = trimSearch(query.q);
      const order = orderFragment(
        classSorts(sql),
        query.sort,
        query.direction ?? 'desc',
        'createdAt',
      );
      const statusCondition = query.status ? sql`and c.status = ${query.status}` : sql``;
      const searchCondition = search
        ? sql`and (lower(btrim(c.name)) like ${likePattern(search)}
            or c.status::text like ${likePattern(search)}
            or (select count(*)::text from students s where s.class_id = c.id and s.status = 'active') like ${likePattern(search)}
            or (select count(*)::text from assignments a where a.class_id = c.id) like ${likePattern(search)}
            or coalesce(to_char(to_timestamp(c.created_at_ms / 1000.0), 'YYYY-MM-DD'), '') like ${likePattern(search)})`
        : sql``;
      const rows = await sql<(ClassRow & ClassCountRow & { total_items: number | string })[]>`
        select c.id, c.name, c.status, c.archived_at_ms, c.created_at_ms, c.updated_at_ms,
          (select count(*)::int from students s where s.class_id = c.id and s.status = 'active') as student_count,
          (select count(*)::int from assignments a where a.class_id = c.id) as assignment_count,
          count(*) over () as total_items
        from classes c
        where c.teacher_id = ${teacherId} ${statusCondition} ${searchCondition}
          ${notDeletionPending('c', teacherId)}
        order by ${order}, c.id asc
        limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}
      `;
      return {
        data: rows.map(mapClassRecord),
        pagination: pagination(page, totalItemsOf(rows)),
      };
    },

    async findClass(teacherId, classId) {
      const rows = await sql<(ClassRow & ClassCountRow)[]>`
        select c.id, c.name, c.status, c.archived_at_ms, c.created_at_ms, c.updated_at_ms,
          (select count(*)::int from students s where s.class_id = c.id and s.status = 'active') as student_count,
          (select count(*)::int from assignments a where a.class_id = c.id) as assignment_count
        from classes c
        where c.teacher_id = ${teacherId} and c.id = ${classId}
          ${notDeletionPending('c', teacherId)}
        limit 1
      `;
      const row = rows[0];
      return row ? mapClassRecord(row) : null;
    },

    async createClass(teacherId, name) {
      const now = Date.now();
      const rows = await sql<ClassRow[]>`
        insert into classes (teacher_id, name, status, created_at_ms, updated_at_ms)
        values (${teacherId}, ${name}, 'active', ${now}, ${now})
        returning id, teacher_id, name, status, archived_at_ms, created_at_ms, updated_at_ms
      `;
      const row = rows[0];
      if (!row) throw new Error('Unable to create class');
      return mapClassRecord({ ...row, student_count: 0, assignment_count: 0 });
    },

    async updateClass(teacherId, classId, patch) {
      const now = Date.now();
      if (patch.status !== undefined) {
        // Unarchive is out of scope (REQ-021); archiving stamps archived_at once.
        const rows = await sql<ClassRow[]>`
          update classes set
            name = coalesce(${patch.name ?? null}, name),
            status = 'archived',
            archived_at_ms = coalesce(archived_at_ms, ${now}),
            updated_at_ms = ${now}
          where teacher_id = ${teacherId} and id = ${classId}
          returning id, teacher_id, name, status, archived_at_ms, created_at_ms, updated_at_ms
        `;
        const row = rows[0];
        if (!row) return null;
        return this.findClass(teacherId, row.id);
      }
      const rows = await sql<ClassRow[]>`
        update classes set name = coalesce(${patch.name ?? null}, name), updated_at_ms = ${now}
        where teacher_id = ${teacherId} and id = ${classId}
        returning id, teacher_id, name, status, archived_at_ms, created_at_ms, updated_at_ms
      `;
      const row = rows[0];
      if (!row) return null;
      return this.findClass(teacherId, row.id);
    },

    // ——— Students ———————————————————————————————————————————————————————————

    async listStudents({ teacherId, classId, query }) {
      const page = query.page ?? 1;
      const search = trimSearch(query.q);
      const order = orderFragment(
        studentSorts(sql),
        query.sort,
        query.direction ?? 'asc',
        'name',
      );
      const statusCondition = query.status ? sql`and s.status = ${query.status}` : sql``;
      const searchCondition = search
        ? sql`and (lower(btrim(s.name)) like ${likePattern(search)}
            or s.status::text like ${likePattern(search)}
            or coalesce(to_char(to_timestamp(s.created_at_ms / 1000.0), 'YYYY-MM-DD'), '') like ${likePattern(search)})`
        : sql``;
      const rows = await sql<(StudentRow & { total_items: number | string })[]>`
        select s.id, s.class_id, s.teacher_id, s.name, s.status,
               s.created_at_ms, s.updated_at_ms, s.removed_at_ms,
               count(*) over () as total_items
        from students s
        where s.teacher_id = ${teacherId} and s.class_id = ${classId}
          ${statusCondition} ${searchCondition}
          ${notDeletionPending('s', teacherId)}
        order by ${order}, s.id asc
        limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}
      `;
      return {
        data: rows.map(mapStudentRecord),
        pagination: pagination(page, totalItemsOf(rows)),
      };
    },

    async findStudent(teacherId, studentId) {
      const rows = await sql<StudentRow[]>`
        select id, class_id, teacher_id, name, status, created_at_ms, updated_at_ms, removed_at_ms
        from students
        where teacher_id = ${teacherId} and id = ${studentId}
          ${notDeletionPending('s', teacherId)}
        limit 1
      `;
      const row = rows[0];
      return row ? mapStudentRecord(row) : null;
    },

    async createStudent(teacherId, classId, name) {
      const now = Date.now();
      const rows = await sql<StudentRow[]>`
        insert into students (class_id, teacher_id, name, status, created_at_ms, updated_at_ms)
        values (${classId}, ${teacherId}, ${name}, 'active', ${now}, ${now})
        returning id, class_id, teacher_id, name, status, created_at_ms, updated_at_ms, removed_at_ms
      `;
      const row = rows[0];
      if (!row) throw new Error('Unable to create student');
      return mapStudentRecord(row);
    },

    async updateStudent(teacherId, studentId, name) {
      const now = Date.now();
      const rows = await sql<StudentRow[]>`
        update students set name = ${name}, updated_at_ms = ${now}
        where teacher_id = ${teacherId} and id = ${studentId}
        returning id, class_id, teacher_id, name, status, created_at_ms, updated_at_ms, removed_at_ms
      `;
      const row = rows[0];
      return row ? mapStudentRecord(row) : null;
    },

    async removeStudent(teacherId, studentId) {
      const now = Date.now();
      const rows = await sql<StudentRow[]>`
        update students set status = 'removed', removed_at_ms = ${now}, updated_at_ms = ${now}
        where teacher_id = ${teacherId} and id = ${studentId}
        returning id, class_id, teacher_id, name, status, created_at_ms, updated_at_ms, removed_at_ms
      `;
      const row = rows[0];
      return row ? mapStudentRecord(row) : null;
    },

    // ——— Assignments ————————————————————————————————————————————————————————

    async listAssignments({ teacherId, classId, query }) {
      const page = query.page ?? 1;
      const search = trimSearch(query.q);
      const order = orderFragment(
        assignmentSorts(sql),
        query.sort,
        query.direction ?? 'desc',
        'createdAt',
      );
      const statusCondition = query.status ? sql`and a.status = ${query.status}` : sql``;
      const searchCondition = search
        ? sql`and (lower(btrim(a.name)) like ${likePattern(search)}
            or a.status::text like ${likePattern(search)}
            or coalesce(to_char(to_timestamp(a.created_at_ms / 1000.0), 'YYYY-MM-DD'), '') like ${likePattern(search)})`
        : sql``;
      const rows = await sql<(AssignmentRow & { total_items: number | string })[]>`
        select a.id, a.class_id, a.teacher_id, a.name, a.status, a.max_score,
               a.created_at_ms, a.updated_at_ms,
               count(*) over () as total_items
        from assignments a
        where a.teacher_id = ${teacherId} and a.class_id = ${classId}
          ${statusCondition} ${searchCondition}
          ${notDeletionPending('a', teacherId)}
        order by ${order}, a.id asc
        limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}
      `;
      return {
        data: rows.map(mapAssignmentListItem),
        pagination: pagination(page, totalItemsOf(rows)),
      };
    },

    async findAssignment(teacherId, assignmentId) {
      const rows = await sql<(AssignmentRow & { class_name: string; class_status: 'active' | 'archived' })[]>`
        select a.id, a.class_id, a.teacher_id, a.name, a.status, a.max_score,
               a.created_at_ms, a.updated_at_ms,
               c.name as class_name, c.status as class_status
        from assignments a
        join classes c on c.id = a.class_id
        where a.teacher_id = ${teacherId} and a.id = ${assignmentId}
          ${notDeletionPending('a', teacherId)}
        limit 1
      `;
      const row = rows[0];
      if (!row) return null;
      const [submissionCounts, currentMaterialVersion] = await Promise.all([
        buildSubmissionCounts(sql, teacherId, row.id),
        findCurrentMaterialVersionSummary(sql, teacherId, row.id),
      ]);
      return {
        ...mapAssignmentListItem(row),
        className: row.class_name,
        classStatus: row.class_status,
        currentMaterialVersion,
        submissionCounts,
      };
    },

    async createAssignment(teacherId, classId, name, maxScore) {
      const now = Date.now();
      const rows = await sql<AssignmentRow[]>`
        insert into assignments (class_id, teacher_id, name, status, max_score, created_at_ms, updated_at_ms)
        values (${classId}, ${teacherId}, ${name}, 'need_review', ${maxScore}, ${now}, ${now})
        returning id, class_id, teacher_id, name, status, max_score, created_at_ms, updated_at_ms
      `;
      const row = rows[0];
      if (!row) throw new Error('Unable to create assignment');
      const counts: SubmissionCounts = {
        total: 0,
        notStarted: 0,
        processing: 0,
        needsReview: 0,
        readyToGrade: 0,
        graded: 0,
        failed: 0,
      };
      return {
        ...mapAssignmentListItem(row),
        className: '',
        classStatus: 'active',
        currentMaterialVersion: null,
        submissionCounts: counts,
      };
    },

    async updateAssignment(teacherId, assignmentId, patch) {
      const now = Date.now();
      if (patch.maxScore !== undefined) {
        // Null removes the maximum; a number replaces it (REQ-018 contract).
        const rows = await sql<AssignmentRow[]>`
          update assignments set
            name = coalesce(${patch.name ?? null}, name),
            max_score = ${patch.maxScore},
            updated_at_ms = ${now}
          where teacher_id = ${teacherId} and id = ${assignmentId}
          returning id, class_id, teacher_id, name, status, max_score, created_at_ms, updated_at_ms
        `;
        const row = rows[0];
        return row ? (mapAssignmentListItem(row) as AssignmentRecord) : null;
      }
      const rows = await sql<AssignmentRow[]>`
        update assignments set name = coalesce(${patch.name ?? null}, name), updated_at_ms = ${now}
        where teacher_id = ${teacherId} and id = ${assignmentId}
        returning id, class_id, teacher_id, name, status, max_score, created_at_ms, updated_at_ms
      `;
      const row = rows[0];
      return row ? (mapAssignmentListItem(row) as AssignmentRecord) : null;
    },


    async countSubmissionsAboveScore(teacherId, assignmentId, score) {
      const rows = await sql<({ count: number })[]>`
        select count(*)::int as count
        from submissions
        where teacher_id = ${teacherId} and assignment_id = ${assignmentId}
          and score is not null and score > ${score}
      `;
      return Number(rows[0]?.count ?? 0);
    },

    async refreshAssignmentStatus(teacherId, assignmentId) {
      const gradingStates = await submissionGradingStates(sql, teacherId, assignmentId);
      const status = computeAssignmentStatus({ submissionGradingStates: gradingStates });
      await sql`
        update assignments set status = ${status}, updated_at_ms = ${Date.now()}
        where teacher_id = ${teacherId} and id = ${assignmentId}
      `;
      return status;
    },

    // ——— Materials ——————————————————————————————————————————————————————————

    async listMaterialVersions({ teacherId, assignmentId, page }) {
      const rows = await sql<(MaterialVersionRow & { total_items: number | string; page_count: number | string; page_states: string[] | null })[]>`
        select v.id, v.assignment_id, v.teacher_id, v.version, v.lifecycle,
               v.document_revision, v.draft_confirmed, v.confirmed_at_ms, v.replaced_at_ms,
               v.review_state, v.created_at_ms, v.updated_at_ms,
               (select count(*)::int from pages p where p.materials_version_id = v.id) as page_count,
               (select coalesce(jsonb_agg(p.processing_state order by p.position), '[]'::jsonb)
                from pages p where p.materials_version_id = v.id) as page_states,
               count(*) over () as total_items
        from assignment_material_versions v
        where v.teacher_id = ${teacherId} and v.assignment_id = ${assignmentId}
          ${notDeletionPending('v', teacherId)}
        order by v.version desc, v.id asc
        limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}
      `;
      return {
        data: rows.map(mapMaterialVersionSummary),
        pagination: pagination(page, totalItemsOf(rows)),
      };
    },

    async findMaterialVersion(teacherId, materialVersionId) {
      const rows = await sql<(MaterialVersionRow & { page_count: number | string; page_states: string[] | null })[]>`
        select ${materialVersionSelect()}
        from assignment_material_versions v
        where v.teacher_id = ${teacherId} and v.id = ${materialVersionId}
          ${notDeletionPending('v', teacherId)}
        limit 1
      `;
      const row = rows[0];
      return row ? mapMaterialVersionSummary(row) : null;
    },

    async findCurrentMaterialVersion(teacherId, assignmentId) {
      return findCurrentMaterialVersionSummary(sql, teacherId, assignmentId);
    },

    async createDraftMaterialVersion(teacherId, assignmentId) {
      const now = Date.now();
      // Atomic: at most one draft per assignment; version = max + 1 resolves
      // inside the single statement so concurrent creates cannot collide.
      const rows = await sql<MaterialVersionRow[]>`
        insert into assignment_material_versions (
          assignment_id, teacher_id, version, lifecycle, document_revision,
          draft_confirmed, created_at_ms, updated_at_ms
        )
        select ${assignmentId}, ${teacherId}, coalesce(max(v.version), 0) + 1, 'draft', 1, false, ${now}, ${now}
        from assignment_material_versions v
        where v.assignment_id = ${assignmentId}
          and v.teacher_id = ${teacherId}
          and not exists (
            select 1 from assignment_material_versions d
            where d.teacher_id = ${teacherId} and d.assignment_id = ${assignmentId} and d.lifecycle = 'draft'
          )
        returning id, assignment_id, teacher_id, version, lifecycle, document_revision,
                  draft_confirmed, confirmed_at_ms, replaced_at_ms, review_state, created_at_ms, updated_at_ms
      `;
      const row = rows[0];
      if (!row) return null; // A draft already exists; the service replays it.
      return mapMaterialVersionSummary({ ...row, page_count: 0, page_states: [] });
    },

    async findDraftMaterialVersion(teacherId, assignmentId) {
      const rows = await sql<(MaterialVersionRow & { page_count: number | string; page_states: string[] | null })[]>`
        select ${materialVersionSelect()}
        from assignment_material_versions v
        where v.teacher_id = ${teacherId} and v.assignment_id = ${assignmentId} and v.lifecycle = 'draft'
        limit 1
      `;
      const row = rows[0];
      return row ? mapMaterialVersionSummary(row) : null;
    },

    // ——— Submissions ————————————————————————————————————————————————————————

    async listSubmissions({ teacherId, assignmentId, query }) {
      const page = query.page ?? 1;
      const search = trimSearch(query.q);
      const order = orderFragment(
        submissionSorts(sql),
        query.sort,
        query.direction ?? 'asc',
        'studentName',
      );
      const statusCondition = query.status ? sql`and r.display_status = ${query.status}` : sql``;
      const searchCondition = search
        ? sql`and (lower(btrim(r.student_name)) like ${likePattern(search)}
            or r.display_status::text like ${likePattern(search)}
            or coalesce(to_char(to_timestamp(r.created_at_ms / 1000.0), 'YYYY-MM-DD'), '') like ${likePattern(search)})`
        : sql``;
      const rows = await sql<(SubmissionListWire & { total_items: number | string })[]>`
        with roster as (
          select st.id as student_id, st.name as student_name,
                 null::uuid as submission_id, null::bigint as created_at_ms
          from students st
          where st.teacher_id = ${teacherId}
            and st.class_id = (select a.class_id from assignments a where a.teacher_id = ${teacherId} and a.id = ${assignmentId})
            and st.status = 'active'
            and not exists (
              select 1 from submissions sb
              where sb.teacher_id = ${teacherId} and sb.assignment_id = ${assignmentId} and sb.student_id = st.id
            )
            and not exists (
              select 1 from deletion_operations d
              where d.teacher_id = ${teacherId} and d.status = 'pending' and d.target_id = st.id
            )
        ),
        created as (
          select sb.student_id, sb.id as submission_id, sb.created_at_ms,
                 sb.review_state, sb.grading_state, sb.score, sb.draft_confirmed,
                 (select coalesce(jsonb_agg(p.processing_state order by p.position), '[]'::jsonb)
                  from pages p where p.submission_id = sb.id) as page_states
          from submissions sb
          where sb.teacher_id = ${teacherId} and sb.assignment_id = ${assignmentId}
            and not exists (
              select 1 from deletion_operations d
              where d.teacher_id = ${teacherId} and d.status = 'pending' and d.target_id = sb.id
            )
        ),
        ranked as (
          select 'not_started'::text as display_status, r.student_id, r.student_name,
                 r.submission_id, r.created_at_ms,
                 null::text as review_state, null::text as grading_state,
                 null::numeric as score, null::jsonb as page_states
          from roster r
          union all
          select case
                   when c.grading_state = 'graded' then 'graded'::text
                   when c.draft_confirmed and
                        (select count(*) from jsonb_array_elements_text(c.page_states)) > 0 and
                        not exists (
                          select 1 from jsonb_array_elements_text(c.page_states) s
                          where s <> 'completed'
                        )
                     then coalesce(c.review_state, 'needs_review')::text
                   when exists (select 1 from jsonb_array_elements_text(c.page_states) s where s = 'failed')
                     then 'error'::text
                   when exists (select 1 from jsonb_array_elements_text(c.page_states) s where s = 'uploading')
                     then 'uploading'::text
                   when exists (select 1 from jsonb_array_elements_text(c.page_states) s where s = 'transcribing')
                     then 'transcribing'::text
                   when exists (select 1 from jsonb_array_elements_text(c.page_states) s where s = 'queued')
                     then 'queued'::text
                   else 'uploading'::text
                 end as display_status, c.student_id, st.name as student_name,
                 c.submission_id, c.created_at_ms,
                 c.review_state, c.grading_state, c.score, c.page_states
          from created c
          join students st on st.id = c.student_id
        )
        select r.display_status, r.student_id, r.student_name, r.submission_id,
               r.created_at_ms, r.review_state, r.grading_state, r.score,
               coalesce(jsonb_array_length(r.page_states), 0)::int as page_count,
               count(*) over () as total_items
        from ranked r
        where true ${statusCondition} ${searchCondition}
        order by ${order}, r.student_id asc
        limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}
      `;
      const items: SubmissionListItem[] = rows.map((row) => ({
        studentId: row.student_id,
        studentName: row.student_name,
        submissionId: row.submission_id,
        createdAt: toIso(row.created_at_ms),
        pageCount: Number(row.page_count),
        processingState: null,
        reviewState: (row.review_state as ReviewState | null) ?? null,
        gradingState: (row.grading_state as GradingState | null) ?? null,
        score: toNumber(row.score),
        displayStatus: row.display_status as SubmissionListStatus,
      }));
      return { data: items, pagination: pagination(page, totalItemsOf(rows)) };
    },

    // TASK-008: the Processing canonical list. Displayed columns are Date
    // (uploaded), Name (server page label), and Status; search covers all
    // three. Pages are scoped to one owned document through the same
    // teacher_id predicate as every other read (SEC-001).
    async listProcessing({ teacherId, documentType, documentId, query }) {
      const page = query.page ?? 1;
      const search = trimSearch(query.q);
      const order = orderFragment(
        processingSorts(sql),
        query.sort,
        query.direction ?? 'asc',
        'uploadedAt',
      );
      const statusCondition = query.status ? sql`and p.processing_state = ${query.status}` : sql``;
      const searchCondition = search
        ? sql`and (lower(btrim(p.label)) like ${likePattern(search)}
            or p.processing_state::text like ${likePattern(search)}
            or coalesce(to_char(to_timestamp(p.uploaded_at_ms / 1000.0), 'YYYY-MM-DD'), '') like ${likePattern(search)})`
        : sql``;
      const parentCondition =
        documentType === 'materials'
          ? sql`p.materials_version_id = ${documentId}`
          : sql`p.submission_id = ${documentId}`;
      const rows = await sql<(ProcessingPageRow & { total_items: number | string })[]>`
        select p.id, p.document_type, p.materials_version_id, p.submission_id,
               p.position, p.label, p.processing_state, p.attempt_count,
               p.page_revision, p.content_revision, p.reviewed_content_revision,
               p.edited_by_teacher, p.teacher_edit_count,
               p.queued_at_ms, p.started_at_ms, p.completed_at_ms, p.uploaded_at_ms,
               p.draft, p.failure_code,
               count(*) over () as total_items
        from pages p
        where p.teacher_id = ${teacherId} and ${parentCondition}
          ${statusCondition} ${searchCondition}
        order by ${order}, p.id asc
        limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}
      `;
      const nowMs = Date.now();
      return {
        data: rows.map((row) => mapProcessingPageItem(row, nowMs)),
        pagination: pagination(page, totalItemsOf(rows)),
      };
    },

    // ——— Retry and retranscription (TASK-015) ——————————————————————————————————

    /**
     * Single-page retry (api-routes-documents.md §3.3). One transaction:
     * conditionally bump only this page's `pageRevision` back to `queued`
     * (resetting attempt/failure/generated-content/timing columns, plus
     * `editedByTeacher`, `reviewedContentRevision`, and `reviewedAt` back to
     * their defaults since the new attempt's draft has no edits or review
     * yet; `contentRevision` and `teacherEditCount` are teacher-edit-scoped
     * counters that the documented contract says retry must not touch, so
     * they are left as-is), then bump the owning document's
     * `documentRevision` and clear its review state; a submission also
     * returns to `not_graded` with a null `gradedAt` while its
     * score/comments are untouched. The `processing_state = 'failed'` guard
     * makes a pre-commit race (page changed between the service's
     * eligibility check and this write) a no-op `null` result rather than a
     * silent overwrite (SEC-004).
     */
    async retryPageRow(teacherId, pageId) {
      const now = Date.now();
      return sql.begin(async (tx) => {
        const pageRows = await tx<PageRow[]>`
          update pages p set
            page_revision = page_revision + 1,
            processing_state = 'queued',
            attempt_count = 0,
            failure_code = null,
            failure_message = null,
            draft = null,
            reviewed_content_revision = null,
            reviewed_at_ms = null,
            edited_by_teacher = false,
            started_at_ms = null,
            completed_at_ms = null,
            queued_at_ms = ${now},
            updated_at_ms = ${now}
          where p.teacher_id = ${teacherId} and p.id = ${pageId} and p.processing_state = 'failed'
          returning ${pageColumns(tx)}
        `;
        const page = pageRows[0];
        if (!page) return null;
        if (page.document_type === 'materials') {
          const docRows = await tx<({ document_revision: number })[]>`
            update assignment_material_versions set
              document_revision = document_revision + 1,
              review_state = null,
              updated_at_ms = ${now}
            where id = ${page.materials_version_id} and teacher_id = ${teacherId}
            returning document_revision
          `;
          return { page, documentRevision: Number(docRows[0]?.document_revision ?? 0) };
        }
        const docRows = await tx<({ document_revision: number })[]>`
          update submissions set
            document_revision = document_revision + 1,
            review_state = null,
            grading_state = 'not_graded', graded_at_ms = null,
            updated_at_ms = ${now}
          where id = ${page.submission_id} and teacher_id = ${teacherId}
          returning document_revision
        `;
        return { page, documentRevision: Number(docRows[0]?.document_revision ?? 0) };
      });
    },

    /**
     * Whole-document retranscription (api-routes-documents.md §3.4). One
     * transaction: conditionally bump the document's `documentRevision` only
     * when it still equals `expectedDocumentRevision` (compare-and-swap;
     * `null` return is 409 REVISION_CONFLICT with nothing committed), clear
     * its review state (and, for a submission, return grading to
     * `not_graded` with a null `gradedAt`), then bump every current
     * `completed` page back to `queued` with reset attempt/failure/
     * generated-content/timing columns, plus `editedByTeacher`,
     * `reviewedContentRevision`, and `reviewedAt` back to their defaults,
     * since the new attempt's draft has no edits or review yet
     * (teacher-edit consent for this call is already covered by
     * `overwriteTeacherEdits`). `contentRevision` and `teacherEditCount` are
     * teacher-edit-scoped counters and the documented contract requires
     * retranscription to leave them untouched. Page IDs and order are
     * untouched; old question segments stay tied to the superseded
     * `pageRevision` as audit history (PAT-004).
     */
    async retranscribeDocumentRows({ teacherId, documentType, documentId, expectedDocumentRevision }) {
      const now = Date.now();
      const isMaterials = documentType === 'materials';
      return sql.begin(async (tx) => {
        const revRows = isMaterials
          ? await tx<({ document_revision: number })[]>`
              update assignment_material_versions set
                document_revision = document_revision + 1,
                review_state = null,
                updated_at_ms = ${now}
              where id = ${documentId} and teacher_id = ${teacherId}
                and document_revision = ${expectedDocumentRevision}
              returning document_revision
            `
          : await tx<({ document_revision: number })[]>`
              update submissions set
                document_revision = document_revision + 1,
                review_state = null,
                grading_state = 'not_graded', graded_at_ms = null,
                updated_at_ms = ${now}
              where id = ${documentId} and teacher_id = ${teacherId}
                and document_revision = ${expectedDocumentRevision}
              returning document_revision
            `;
        if (revRows.length === 0) return null;
        const parentConditionTx = isMaterials
          ? tx`materials_version_id = ${documentId}`
          : tx`submission_id = ${documentId}`;
        const pages = await tx<PageRow[]>`
          update pages set
            page_revision = page_revision + 1,
            processing_state = 'queued',
            attempt_count = 0,
            failure_code = null,
            failure_message = null,
            draft = null,
            reviewed_content_revision = null,
            reviewed_at_ms = null,
            edited_by_teacher = false,
            started_at_ms = null,
            completed_at_ms = null,
            queued_at_ms = ${now},
            updated_at_ms = ${now}
          where teacher_id = ${teacherId} and ${parentConditionTx} and processing_state = 'completed'
          returning ${pageColumns(tx)}
        `;
        return { documentRevision: Number(revRows[0]?.document_revision ?? 0), pages };
      });
    },

    async hasCurrentQuestionJudgments(teacherId, submissionId) {
      const rows = await sql<({ exists: boolean })[]>`
        select exists (
          select 1 from question_judgments qj
          join pages p on p.id = qj.page_id
          where qj.teacher_id = ${teacherId}
            and p.submission_id = ${submissionId}
            and qj.page_revision = p.page_revision
        ) as exists
      `;
      return rows[0]?.exists ?? false;
    },

    // ——— Workspace, review, and grading (TASK-016/TASK-017) ——————————————————

    async listCurrentQuestionSegments(teacherId, pageId) {
      const rows = await sql<QuestionSegmentWithJudgmentRow[]>`
        select qs.id, qs.page_id, qs.page_revision, qs.ordinal, qs.label,
               qs.question_text, qs.response_text,
               qj.judgment, qj.awarded_points, qj.comment,
               qj.updated_at_ms as judgment_updated_at_ms
        from question_segments qs
        join pages p on p.id = qs.page_id and p.page_revision = qs.page_revision
        left join question_judgments qj
          on qj.segment_id = qs.id and qj.page_id = qs.page_id and qj.page_revision = qs.page_revision
            and qj.teacher_id = ${teacherId}
        where qs.page_id = ${pageId} and p.teacher_id = ${teacherId}
        order by qs.ordinal asc
      `;
      return rows;
    },

    async listSubmissionQuestionSegments(teacherId, submissionId) {
      const rows = await sql<QuestionSegmentWithJudgmentRow[]>`
        select qs.id, qs.page_id, qs.page_revision, qs.ordinal, qs.label,
               qs.question_text, qs.response_text,
               qj.judgment, qj.awarded_points, qj.comment,
               qj.updated_at_ms as judgment_updated_at_ms
        from pages p
        join question_segments qs on qs.page_id = p.id and qs.page_revision = p.page_revision
        left join question_judgments qj
          on qj.segment_id = qs.id and qj.page_id = qs.page_id and qj.page_revision = qs.page_revision
            and qj.teacher_id = ${teacherId}
        where p.submission_id = ${submissionId} and p.teacher_id = ${teacherId}
        order by p.position asc, qs.ordinal asc
      `;
      return rows;
    },

    /**
     * PATCH /pages/:pageId/draft (api-routes-review.md §1.3): one
     * transaction locks the page, enforces "current + completed" and the
     * `expectedContentRevision` compare-and-swap, writes the new draft, and
     * clears that page's review. The parent document's `reviewState`
     * recomputes from its current siblings (needs_review when every current
     * page is still completed, otherwise null); a submission also returns to
     * `not_graded` with a null `gradedAt` while retaining score, comments,
     * and judgments (REQ-016).
     */
    async updatePageDraftRow({ teacherId, pageId, draft, expectedContentRevision }) {
      const now = Date.now();
      return sql.begin(async (tx) => {
        const pageRows = await tx<PageRow[]>`
          select ${pageColumns(tx)} from pages where teacher_id = ${teacherId} and id = ${pageId} for update
        `;
        const page = pageRows[0];
        if (!page) return { outcome: 'not_found' };
        if (page.processing_state !== 'completed') return { outcome: 'invalid_state' };
        if (page.content_revision !== expectedContentRevision) {
          return { outcome: 'conflict', currentContentRevision: page.content_revision };
        }
        const updated = await tx<PageRow[]>`
          update pages set
            content_revision = content_revision + 1,
            teacher_edit_count = teacher_edit_count + 1,
            edited_by_teacher = true,
            draft = ${sql.json(JSON.parse(JSON.stringify(draft)))}::jsonb,
            reviewed_content_revision = null,
            reviewed_at_ms = null,
            updated_at_ms = ${now}
          where id = ${pageId}
          returning ${pageColumns(tx)}
        `;
        const newPage = updated[0];
        if (!newPage) throw new Error('Unable to update page draft');
        const isMaterials = page.document_type === 'materials';
        const parentId = isMaterials ? page.materials_version_id : page.submission_id;
        const parentConditionTx = isMaterials
          ? tx`materials_version_id = ${parentId}`
          : tx`submission_id = ${parentId}`;
        const siblings = await tx<({ processing_state: ProcessingState })[]>`
          select processing_state from pages where teacher_id = ${teacherId} and ${parentConditionTx}
        `;
        const allCompleted =
          siblings.length > 0 && siblings.every((s) => s.processing_state === 'completed');
        const documentReviewState: 'needs_review' | null = allCompleted ? 'needs_review' : null;
        if (isMaterials) {
          await tx`
            update assignment_material_versions set review_state = ${documentReviewState}, updated_at_ms = ${now}
            where id = ${parentId} and teacher_id = ${teacherId}
          `;
        } else {
          await tx`
            update submissions set
              review_state = ${documentReviewState},
              grading_state = 'not_graded', graded_at_ms = null, updated_at_ms = ${now}
            where id = ${parentId} and teacher_id = ${teacherId}
          `;
        }
        return { outcome: 'ok', page: newPage, documentReviewState };
      });
    },

    /**
     * POST /pages/:pageId/review (api-routes-review.md §1.4): records the
     * page's current `contentRevision` as reviewed. Allowed only while the
     * parent document's stored `reviewState` is null or needs_review (a
     * ready-to-grade or graded document 409s, matching
     * `canReviewPage`/manifest semantics) — locked in the same transaction as
     * the page row so a concurrent mark-ready cannot race this write.
     */
    async reviewPageRow({ teacherId, pageId, expectedContentRevision }) {
      const now = Date.now();
      return sql.begin(async (tx) => {
        const pageRows = await tx<PageRow[]>`
          select ${pageColumns(tx)} from pages where teacher_id = ${teacherId} and id = ${pageId} for update
        `;
        const page = pageRows[0];
        if (!page) return { outcome: 'not_found' };
        if (page.processing_state !== 'completed') return { outcome: 'invalid_state' };
        const isMaterials = page.document_type === 'materials';
        const parentId = isMaterials ? page.materials_version_id : page.submission_id;
        const parentRows = isMaterials
          ? await tx<({ review_state: string | null })[]>`
              select review_state from assignment_material_versions
              where id = ${parentId} and teacher_id = ${teacherId} for update
            `
          : await tx<({ review_state: string | null })[]>`
              select review_state from submissions
              where id = ${parentId} and teacher_id = ${teacherId} for update
            `;
        const storedParentReviewState = parentRows[0]?.review_state ?? null;
        if (storedParentReviewState !== null && storedParentReviewState !== 'needs_review') {
          return { outcome: 'invalid_state' };
        }
        const parentReviewState = storedParentReviewState as 'needs_review' | null;
        if (page.content_revision !== expectedContentRevision) {
          return { outcome: 'conflict', currentContentRevision: page.content_revision };
        }
        const updated = await tx<PageRow[]>`
          update pages set
            reviewed_content_revision = ${page.content_revision}, reviewed_at_ms = ${now}, updated_at_ms = ${now}
          where id = ${pageId}
          returning ${pageColumns(tx)}
        `;
        const newPage = updated[0];
        if (!newPage) throw new Error('Unable to record page review');
        await tx`
          insert into page_reviews (page_id, page_revision, content_revision, reviewed_at_ms, created_at_ms)
          values (${pageId}, ${newPage.page_revision}, ${newPage.content_revision}, ${now}, ${now})
        `;
        const parentConditionTx = isMaterials
          ? tx`materials_version_id = ${parentId}`
          : tx`submission_id = ${parentId}`;
        const siblings = await tx<({
          processing_state: ProcessingState;
          content_revision: number;
          reviewed_content_revision: number | null;
        })[]>`
          select processing_state, content_revision, reviewed_content_revision from pages
          where teacher_id = ${teacherId} and ${parentConditionTx}
        `;
        const allCurrentPagesReviewed =
          siblings.length > 0 &&
          siblings.every(
            (s) => s.processing_state === 'completed' && s.reviewed_content_revision === s.content_revision,
          );
        return {
          outcome: 'ok',
          page: newPage,
          documentReviewState: parentReviewState,
          allCurrentPagesReviewed,
        };
      });
    },

    /**
     * POST /documents/:documentType/:documentId/mark-ready
     * (api-routes-review.md §1.5): allowed only from stored `needs_review`
     * with every current page completed and reviewed at its current
     * `contentRevision`; the empty/unconfirmed/partial/failed/already-ready/
     * graded cases are all excluded by "stored review_state is exactly
     * needs_review" since those states never reach needs_review in the first
     * place (REQ-011 invariant maintained by every other write in this
     * file). `documentRevision` is not incremented.
     */
    async markDocumentReadyRow({ teacherId, documentType, documentId, expectedDocumentRevision }) {
      const now = Date.now();
      const isMaterials = documentType === 'materials';
      return sql.begin(async (tx) => {
        const rows = isMaterials
          ? await tx<({ document_revision: number; review_state: string | null })[]>`
              select document_revision, review_state from assignment_material_versions
              where id = ${documentId} and teacher_id = ${teacherId} for update
            `
          : await tx<({ document_revision: number; review_state: string | null; grading_state: 'not_graded' | 'graded' })[]>`
              select document_revision, review_state, grading_state from submissions
              where id = ${documentId} and teacher_id = ${teacherId} for update
            `;
        const row = rows[0];
        if (!row) return { outcome: 'not_found' };
        if (row.review_state !== 'needs_review') return { outcome: 'invalid_state' };
        const parentConditionTx = isMaterials
          ? tx`materials_version_id = ${documentId}`
          : tx`submission_id = ${documentId}`;
        const unreviewed = await tx<({ n: number })[]>`
          select count(*)::int as n from pages
          where teacher_id = ${teacherId} and ${parentConditionTx}
            and (processing_state <> 'completed' or reviewed_content_revision is distinct from content_revision)
        `;
        if (Number(unreviewed[0]?.n ?? 1) > 0) return { outcome: 'invalid_state' };
        if (row.document_revision !== expectedDocumentRevision) {
          return { outcome: 'conflict', currentDocumentRevision: row.document_revision };
        }
        if (isMaterials) {
          await tx`
            update assignment_material_versions set review_state = 'ready_to_grade', updated_at_ms = ${now}
            where id = ${documentId} and teacher_id = ${teacherId}
          `;
        } else {
          await tx`
            update submissions set review_state = 'ready_to_grade', updated_at_ms = ${now}
            where id = ${documentId} and teacher_id = ${teacherId}
          `;
        }
        return {
          outcome: 'ok',
          reviewState: 'ready_to_grade',
          gradingState: isMaterials ? null : (row as { grading_state: 'not_graded' | 'graded' }).grading_state,
          documentRevision: row.document_revision,
          updatedAtMs: now,
        };
      });
    },

    /**
     * POST /documents/:documentType/:documentId/return-to-needs-review
     * (api-routes-review.md §1.6): allowed only from stored `ready_to_grade`.
     * Clears every current page's review so the full document must be
     * reviewed again; a submission returns to `not_graded` with a null
     * `gradedAt` while retaining score, comments, and judgments.
     * `documentRevision` is not incremented.
     */
    async returnToNeedsReviewRow({ teacherId, documentType, documentId, expectedDocumentRevision }) {
      const now = Date.now();
      const isMaterials = documentType === 'materials';
      return sql.begin(async (tx) => {
        const rows = isMaterials
          ? await tx<({ document_revision: number; review_state: string | null })[]>`
              select document_revision, review_state from assignment_material_versions
              where id = ${documentId} and teacher_id = ${teacherId} for update
            `
          : await tx<({ document_revision: number; review_state: string | null })[]>`
              select document_revision, review_state from submissions
              where id = ${documentId} and teacher_id = ${teacherId} for update
            `;
        const row = rows[0];
        if (!row) return { outcome: 'not_found' };
        if (row.review_state !== 'ready_to_grade') return { outcome: 'invalid_state' };
        if (row.document_revision !== expectedDocumentRevision) {
          return { outcome: 'conflict', currentDocumentRevision: row.document_revision };
        }
        const parentConditionTx = isMaterials
          ? tx`materials_version_id = ${documentId}`
          : tx`submission_id = ${documentId}`;
        await tx`
          update pages set reviewed_content_revision = null, reviewed_at_ms = null, updated_at_ms = ${now}
          where teacher_id = ${teacherId} and ${parentConditionTx}
        `;
        if (isMaterials) {
          await tx`
            update assignment_material_versions set review_state = 'needs_review', updated_at_ms = ${now}
            where id = ${documentId} and teacher_id = ${teacherId}
          `;
        } else {
          await tx`
            update submissions set
              review_state = 'needs_review', grading_state = 'not_graded', graded_at_ms = null, updated_at_ms = ${now}
            where id = ${documentId} and teacher_id = ${teacherId}
          `;
        }
        return {
          outcome: 'ok',
          reviewState: 'needs_review',
          gradingState: isMaterials ? null : 'not_graded',
          documentRevision: row.document_revision,
          updatedAtMs: now,
        };
      });
    },

    /**
     * PUT /pages/:pageId/question-segments/:segmentId/judgment
     * (api-routes-review.md §2.1). Only a current, completed submission page
     * with its submission `not_graded`/needs_review-or-ready_to_grade may be
     * judged; the segment must belong to this page's current `pageRevision`
     * (an obsolete or foreign segment is `not_found`, never silently
     * upserted). Upserts by the (segment, page, page_revision) unique index,
     * so re-judging the same segment at the same revision replaces it rather
     * than creating audit duplicates — judgments at a superseded revision are
     * untouched (PAT-004).
     */
    async updateQuestionJudgmentRow({
      teacherId,
      pageId,
      segmentId,
      expectedPageRevision,
      judgment,
      awardedPoints,
      comment,
    }) {
      const now = Date.now();
      return sql.begin(async (tx) => {
        const pageRows = await tx<PageRow[]>`
          select ${pageColumns(tx)} from pages
          where teacher_id = ${teacherId} and id = ${pageId} and document_type = 'submission' for update
        `;
        const page = pageRows[0];
        if (!page || !page.submission_id) return { outcome: 'not_found' };
        if (page.processing_state !== 'completed') return { outcome: 'invalid_state' };
        const subRows = await tx<({ grading_state: 'not_graded' | 'graded'; review_state: string | null })[]>`
          select grading_state, review_state from submissions
          where id = ${page.submission_id} and teacher_id = ${teacherId} for update
        `;
        const submission = subRows[0];
        if (!submission) return { outcome: 'not_found' };
        if (
          !canEditGradingDraft({
            documentType: 'submission',
            reviewState: submission.review_state as ReviewState | null,
            gradingState: submission.grading_state,
          })
        ) {
          return { outcome: 'invalid_state' };
        }
        if (page.page_revision !== expectedPageRevision) {
          return { outcome: 'conflict', currentPageRevision: page.page_revision };
        }
        const segmentRows = await tx<({ id: string })[]>`
          select id from question_segments
          where id = ${segmentId} and page_id = ${pageId} and page_revision = ${page.page_revision}
          limit 1
        `;
        if (!segmentRows[0]) return { outcome: 'not_found' };
        const rows = await tx<({
          segment_id: string;
          judgment: 'unmarked' | 'correct' | 'incorrect';
          awarded_points: string | number | null;
          comment: string | null;
          updated_at_ms: number | string;
        })[]>`
          insert into question_judgments (
            segment_id, page_id, page_revision, teacher_id, judgment, awarded_points, comment,
            created_at_ms, updated_at_ms
          ) values (
            ${segmentId}, ${pageId}, ${page.page_revision}, ${teacherId}, ${judgment}, ${awardedPoints}, ${comment},
            ${now}, ${now}
          )
          on conflict (segment_id, page_id, page_revision) do update set
            judgment = excluded.judgment,
            awarded_points = excluded.awarded_points,
            comment = excluded.comment,
            updated_at_ms = excluded.updated_at_ms
          returning segment_id, judgment, awarded_points, comment, updated_at_ms
        `;
        const result = rows[0];
        if (!result) throw new Error('Unable to upsert question judgment');
        return {
          outcome: 'ok',
          segmentId: result.segment_id,
          judgment: result.judgment,
          awardedPoints: result.awarded_points,
          comment: result.comment,
          updatedAtMs: Number(result.updated_at_ms),
        };
      });
    },

    /**
     * PATCH /submissions/:submissionId/grading (api-routes-review.md §2.2).
     * `scoreProvided`/`commentsProvided` distinguish "field omitted" (leave
     * unchanged) from "field explicitly null" (clear it), since both score
     * and comments are independently nullable.
     */
    async updateGradingDraftRow({
      teacherId,
      submissionId,
      expectedDocumentRevision,
      scoreProvided,
      score,
      commentsProvided,
      comments,
    }) {
      const now = Date.now();
      return sql.begin(async (tx) => {
        const rows = await tx<({
          document_revision: number;
          review_state: string | null;
          grading_state: 'not_graded' | 'graded';
        })[]>`
          select document_revision, review_state, grading_state from submissions
          where id = ${submissionId} and teacher_id = ${teacherId} for update
        `;
        const row = rows[0];
        if (!row) return { outcome: 'not_found' };
        if (
          !canEditGradingDraft({
            documentType: 'submission',
            reviewState: row.review_state as ReviewState | null,
            gradingState: row.grading_state,
          })
        ) {
          return { outcome: 'invalid_state' };
        }
        if (row.document_revision !== expectedDocumentRevision) {
          return { outcome: 'conflict', currentDocumentRevision: row.document_revision };
        }
        const updated = await tx<GradingDraftRow[]>`
          update submissions set
            score = case when ${scoreProvided} then ${score} else score end,
            comments = case when ${commentsProvided} then ${comments} else comments end,
            updated_at_ms = ${now}
          where id = ${submissionId} and teacher_id = ${teacherId}
          returning id as submission_id, document_revision, score, comments, grading_state, graded_at_ms, updated_at_ms
        `;
        const result = updated[0];
        if (!result) throw new Error('Unable to update grading draft');
        return { outcome: 'ok', row: result };
      });
    },

    /**
     * GET /submissions/:submissionId/question-points-total
     * (api-routes-review.md §2.3). A plain revision-checked read: the left
     * joins keep one row for the submission even with zero pages/segments, so
     * "uncertain pages work with zero question rows" returns `total: 0`
     * rather than `null`/not-found.
     */
    async getQuestionPointsTotalRow(teacherId, submissionId) {
      const rows = await sql<({
        document_revision: number;
        segment_id: string | null;
        ordinal: number | null;
        label: string | null;
        question_text: string | null;
        page_position: number | null;
        awarded_points: string | number | null;
      })[]>`
        select sb.document_revision,
               qs.id as segment_id, qs.ordinal, qs.label, qs.question_text,
               p.position as page_position, qj.awarded_points
        from submissions sb
        left join pages p on p.submission_id = sb.id
        left join question_segments qs on qs.page_id = p.id and qs.page_revision = p.page_revision
        left join question_judgments qj
          on qj.segment_id = qs.id and qj.page_id = qs.page_id and qj.page_revision = qs.page_revision
            and qj.teacher_id = ${teacherId}
        where sb.id = ${submissionId} and sb.teacher_id = ${teacherId}
        order by p.position asc nulls last, qs.ordinal asc nulls last
      `;
      if (rows.length === 0) return null;
      const documentRevision = rows[0].document_revision;
      const segments = rows
        .filter((row): row is typeof row & { segment_id: string } => row.segment_id !== null)
        .map((row) => ({
          id: row.segment_id,
          ordinal: row.ordinal ?? 0,
          label: row.label,
          questionText: row.question_text,
          awardedPoints: row.awarded_points,
        }));
      return { documentRevision, segments };
    },

    /**
     * POST /submissions/:submissionId/apply-question-points-to-score
     * (api-routes-review.md §2.4). Recomputes the current question-points
     * total inside the same transaction as the gating/CAS checks and the
     * score write, so the applied score can never diverge from what the
     * teacher confirmed.
     */
    async applyQuestionPointsToScoreRow({ teacherId, submissionId, expectedDocumentRevision, expectedTotal }) {
      const now = Date.now();
      return sql.begin(async (tx) => {
        const rows = await tx<({
          document_revision: number;
          review_state: string | null;
          grading_state: 'not_graded' | 'graded';
          max_score: string | number | null;
        })[]>`
          select sb.document_revision, sb.review_state, sb.grading_state, a.max_score
          from submissions sb
          join assignments a on a.id = sb.assignment_id and a.teacher_id = sb.teacher_id
          where sb.id = ${submissionId} and sb.teacher_id = ${teacherId}
          for update of sb
        `;
        const row = rows[0];
        if (!row) return { outcome: 'not_found' };
        if (
          !canEditGradingDraft({
            documentType: 'submission',
            reviewState: row.review_state as ReviewState | null,
            gradingState: row.grading_state,
          })
        ) {
          return { outcome: 'invalid_state' };
        }
        if (row.document_revision !== expectedDocumentRevision) {
          return { outcome: 'conflict', currentDocumentRevision: row.document_revision };
        }
        const totalRows = await tx<({ total: string | number | null })[]>`
          select coalesce(sum(qj.awarded_points), 0) as total
          from pages p
          join question_segments qs on qs.page_id = p.id and qs.page_revision = p.page_revision
          left join question_judgments qj
            on qj.segment_id = qs.id and qj.page_id = qs.page_id and qj.page_revision = qs.page_revision
              and qj.teacher_id = ${teacherId}
          where p.submission_id = ${submissionId} and p.teacher_id = ${teacherId}
        `;
        const currentTotal = Number(totalRows[0]?.total ?? 0);
        if (Math.abs(currentTotal - expectedTotal) > 1e-9) {
          return { outcome: 'total_conflict', currentTotal };
        }
        const maxScore = row.max_score === null || row.max_score === undefined ? null : Number(row.max_score);
        if (maxScore !== null && currentTotal > maxScore) {
          return { outcome: 'score_exceeds_maximum' };
        }
        const updated = await tx<GradingDraftRow[]>`
          update submissions set score = ${currentTotal}, updated_at_ms = ${now}
          where id = ${submissionId} and teacher_id = ${teacherId}
          returning id as submission_id, document_revision, score, comments, grading_state, graded_at_ms, updated_at_ms
        `;
        const result = updated[0];
        if (!result) throw new Error('Unable to apply question points to score');
        return { outcome: 'ok', row: result };
      });
    },

    /**
     * POST /submissions/:submissionId/mark-graded (api-routes-review.md
     * §2.5). Allowed only from `ready_to_grade` + `not_graded`; score and
     * comments remain whatever the draft already holds.
     */
    async markSubmissionGradedRow({ teacherId, submissionId, expectedDocumentRevision }) {
      const now = Date.now();
      return sql.begin(async (tx) => {
        const rows = await tx<({
          document_revision: number;
          review_state: string | null;
          grading_state: 'not_graded' | 'graded';
        })[]>`
          select document_revision, review_state, grading_state from submissions
          where id = ${submissionId} and teacher_id = ${teacherId} for update
        `;
        const row = rows[0];
        if (!row) return { outcome: 'not_found' };
        if (
          !canMarkGraded({
            documentType: 'submission',
            reviewState: row.review_state as ReviewState | null,
            gradingState: row.grading_state,
          })
        ) {
          return { outcome: 'invalid_state' };
        }
        if (row.document_revision !== expectedDocumentRevision) {
          return { outcome: 'conflict', currentDocumentRevision: row.document_revision };
        }
        const updated = await tx<GradingDraftRow[]>`
          update submissions set grading_state = 'graded', graded_at_ms = ${now}, updated_at_ms = ${now}
          where id = ${submissionId} and teacher_id = ${teacherId}
          returning id as submission_id, document_revision, score, comments, grading_state, graded_at_ms, updated_at_ms
        `;
        const result = updated[0];
        if (!result) throw new Error('Unable to mark submission graded');
        return { outcome: 'ok', row: result };
      });
    },

    // ——— Deletion scopes (TASK-018) ————————————————————————————————————————

    async listStorageKeysForMaterialsScope(teacherId, assignmentId) {
      const rows = await sql<({ storage_key: string })[]>`
        select storage_key from pages
        where teacher_id = ${teacherId} and assignment_id = ${assignmentId} and document_type = 'materials'
      `;
      return rows.map((row) => row.storage_key);
    },

    async listStorageKeysForSubmissionScope(teacherId, submissionId) {
      const rows = await sql<({ storage_key: string })[]>`
        select storage_key from pages where teacher_id = ${teacherId} and submission_id = ${submissionId}
      `;
      return rows.map((row) => row.storage_key);
    },

    async listStorageKeysForStudentDataScope(teacherId, studentId) {
      const rows = await sql<({ storage_key: string })[]>`
        select storage_key from pages where teacher_id = ${teacherId} and student_id = ${studentId}
      `;
      return rows.map((row) => row.storage_key);
    },

    async listStorageKeysForAssignmentScope(teacherId, assignmentId) {
      const rows = await sql<({ storage_key: string })[]>`
        select storage_key from pages where teacher_id = ${teacherId} and assignment_id = ${assignmentId}
      `;
      return rows.map((row) => row.storage_key);
    },

    async listStorageKeysForClassScope(teacherId, classId) {
      const rows = await sql<({ storage_key: string })[]>`
        select storage_key from pages where teacher_id = ${teacherId} and class_id = ${classId}
      `;
      return rows.map((row) => row.storage_key);
    },

    async listStorageKeysForAccountScope(teacherId) {
      const rows = await sql<({ storage_key: string })[]>`
        select storage_key from pages where teacher_id = ${teacherId}
      `;
      return rows.map((row) => row.storage_key);
    },

    async findSubmission(teacherId, submissionId) {
      const rows = await sql<(SubmissionRow & { student_name: string; page_count: number | string; page_states: string[] | null })[]>`
        select sb.id, sb.assignment_id, sb.class_id, sb.student_id, sb.teacher_id,
               sb.document_revision, sb.draft_confirmed, sb.confirmed_at_ms,
               sb.review_state, sb.grading_state, sb.score, sb.comments,
               sb.materials_version_id, sb.review_context_captured_at_ms, sb.graded_at_ms,
               sb.created_at_ms, sb.updated_at_ms,
               st.name as student_name,
               (select count(*)::int from pages p where p.submission_id = sb.id) as page_count,
               (select coalesce(jsonb_agg(p.processing_state order by p.position), '[]'::jsonb)
                from pages p where p.submission_id = sb.id) as page_states
        from submissions sb
        join students st on st.id = sb.student_id
        where sb.teacher_id = ${teacherId} and sb.id = ${submissionId}
          ${notDeletionPending('sb', teacherId)}
        limit 1
      `;
      const row = rows[0];
      if (!row) return null;
      const states = (row.page_states ?? []) as ProcessingState[];
      return {
        id: row.id,
        assignmentId: row.assignment_id,
        studentId: row.student_id,
        studentName: row.student_name,
        pageCount: Number(row.page_count),
        processingState: computeDocumentProcessingState(states),
        processingCounts: computeProcessingCounts(states),
        // `review_state` is authoritative, including 'ready_to_grade' — see
        // the matching comment on `mapMaterialVersionSummary`.
        reviewState: (row.review_state as ReviewState | null) ?? null,
        gradingState: row.grading_state as GradingState,
        documentRevision: row.document_revision,
        score: toNumber(row.score),
        comments: row.comments,
        materialsVersionId: row.materials_version_id,
        reviewContextCapturedAt: toIso(row.review_context_captured_at_ms),
        gradedAt: toIso(row.graded_at_ms),
        createdAt: toIso(row.created_at_ms) as string,
        updatedAt: toIso(row.updated_at_ms) as string,
        readOnly: false,
      };
    },

    async createSubmission(teacherId, assignmentId, studentId) {
      const now = Date.now();
      // REQ-006: the unique (assignment_id, student_id) index returns the
      // existing submission rather than creating a duplicate.
      const rows = await sql<SubmissionRow[]>`
        insert into submissions (
          assignment_id, class_id, student_id, teacher_id, document_revision,
          draft_confirmed, review_state, grading_state, created_at_ms, updated_at_ms
        )
        values (
          ${assignmentId},
          (select class_id from assignments where teacher_id = ${teacherId} and id = ${assignmentId}),
          ${studentId}, ${teacherId}, 1, false, null, 'not_graded', ${now}, ${now}
        )
        on conflict (assignment_id, student_id) do nothing
        returning id
      `;
      const insertedId = rows[0]?.id;
      const submissionId = insertedId
        ?? (
          await sql<({ id: string })[]>`
            select id from submissions
            where teacher_id = ${teacherId} and assignment_id = ${assignmentId} and student_id = ${studentId}
            limit 1
          `
        )[0]?.id;
      if (!submissionId) throw new Error('Unable to create submission');
      const submission = await this.findSubmission(teacherId, submissionId);
      if (!submission) throw new Error('Unable to create submission');
      return { submission, created: insertedId !== undefined };
    },

    // ——— Seating charts (TASK-009) ——————————————————————————————————————————

    async listSavedSeatingCharts(teacherId, classId, query) {
      const page = query.page ?? 1;
      const search = trimSearch(query.q);
      const order = orderFragment(
        seatingSorts(sql),
        query.sort,
        query.direction ?? 'desc',
        'createdAt',
      );
      // Search covers exactly the displayed columns: Date (created), Class
      // name, and Student Count (REQ-003; api-types.md §1).
      const searchCondition = search
        ? sql`and (lower(btrim(c.name)) like ${likePattern(search)}
            or g.student_count::text like ${likePattern(search)}
            or coalesce(to_char(to_timestamp(g.created_at_ms / 1000.0), 'YYYY-MM-DD'), '') like ${likePattern(search)})`
        : sql``;
      const rows = await sql<(SeatingChartRow & { total_items: number | string })[]>`
        select g.id, g.class_id, g.teacher_id, g.source_job_external_id, g.source_result_id,
               g.grid, g.student_count, g.created_at_ms, c.name as class_name,
               count(*) over () as total_items
        from saved_seating_charts g
        join classes c on c.id = g.class_id
        where g.teacher_id = ${teacherId} and g.class_id = ${classId}
          ${searchCondition}
        order by ${order}, g.id asc
        limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}
      `;
      return {
        data: rows.map(mapSavedSeatingChart),
        pagination: pagination(page, totalItemsOf(rows)),
      };
    },

    async findSavedSeatingChart(teacherId, chartId) {
      const rows = await sql<(SeatingChartRow & { total_items: number | string })[]>`
        select g.id, g.class_id, g.teacher_id, g.source_job_external_id, g.source_result_id,
               g.grid, g.student_count, g.created_at_ms, c.name as class_name
        from saved_seating_charts g
        join classes c on c.id = g.class_id
        where g.teacher_id = ${teacherId} and g.id = ${chartId}
        limit 1
      `;
      const row = rows[0];
      return row ? mapSavedSeatingChart(row) : null;
    },

    async findSavedSeatingChartByJob(teacherId, classId, sourceJobExternalId) {
      const rows = await sql<SeatingChartRow[]>`
        select g.id, g.class_id, g.teacher_id, g.source_job_external_id, g.source_result_id,
               g.grid, g.student_count, g.created_at_ms, c.name as class_name
        from saved_seating_charts g
        join classes c on c.id = g.class_id
        where g.teacher_id = ${teacherId} and g.class_id = ${classId}
          and g.source_job_external_id = ${sourceJobExternalId}
        order by g.created_at_ms asc
        limit 1
      `;
      const row = rows[0];
      return row ? mapSavedSeatingChart(row) : null;
    },

    async saveSeatingChart(input) {
      const now = Date.now();
      // Hierarchy contract §2.9: idempotent per (class, source job). The
      // unique index carries exactly that key; a lost race replays the
      // winner's snapshot instead of throwing a 500.
      const rows = await sql<SeatingChartRow[]>`
        insert into saved_seating_charts (
          class_id, teacher_id, source_job_external_id, source_result_id,
          grid, student_count, created_at_ms
        )
        values (
          ${input.classId}, ${input.teacherId}, ${input.sourceJobExternalId},
          ${input.sourceResultId}, ${sql.json(input.grid)}::jsonb,
          ${input.studentCount}, ${now}
        )
        on conflict (class_id, source_job_external_id) do nothing
        returning id, class_id, teacher_id, source_job_external_id, source_result_id,
                  grid, student_count, created_at_ms
      `;
      const row = rows[0];
      if (row) return mapSavedSeatingChart({ ...row, class_name: '' });
      // Concurrent duplicate: replay the snapshot the winning insert created.
      const existing = await this.findSavedSeatingChartByJob(
        input.teacherId,
        input.classId,
        input.sourceJobExternalId,
      );
      if (existing) return existing;
      throw new Error('Unable to save seating chart');
    },

    async findSeatingJobByExternalId(teacherId, externalId) {
      const rows = await sql<{ id: string; external_id: string }[]>`
        select id, external_id from jobs
        where user_id = ${teacherId} and external_id = ${externalId}
        limit 1
      `;
      const row = rows[0];
      return row ? { id: row.id, externalId: row.external_id } : null;
    },

    async findSeatingResult(jobId, resultId) {
      const rows = await sql<({ id: number | string; arrangement: unknown })[]>`
        select id, arrangement from seating_results
        where job_id = ${jobId} and id = ${resultId}
        limit 1
      `;
      const row = rows[0];
      return row
        ? { id: Number(row.id), arrangement: row.arrangement as SavedChartGrid }
        : null;
    },
  };

  return repo;
};

// ——— Module-level helpers (no `this` coupling) —————————————————————————————————

interface SubmissionListWire {
  display_status: string;
  student_id: string;
  student_name: string;
  submission_id: string | null;
  created_at_ms: number | string | null;
  review_state: string | null;
  grading_state: string | null;
  score: string | number | null;
  page_count: number | string;
}

const submissionGradingStates = async (
  sql: Sql,
  teacherId: string,
  assignmentId: string,
): Promise<GradingState[]> => {
  const rows = await sql<({ grading_state: 'not_graded' | 'graded' })[]>`
    select grading_state from submissions
    where teacher_id = ${teacherId} and assignment_id = ${assignmentId}
  `;
  return rows.map((row) => row.grading_state as GradingState);
};

/** PAT-003 aggregate: created submissions only; roster-only students and
 * materials never enter the denominator. */
const buildSubmissionCounts = async (
  sql: Sql,
  teacherId: string,
  assignmentId: string,
): Promise<SubmissionCounts> => {
  const rows = await sql<({ grading_state: 'not_graded' | 'graded'; review_state: 'needs_review' | 'ready_to_grade' | null; page_states: string[] | null })[]>`
    select sb.grading_state, sb.review_state,
           (select coalesce(jsonb_agg(p.processing_state order by p.position), '[]'::jsonb)
            from pages p where p.submission_id = sb.id) as page_states
    from submissions sb
    where sb.teacher_id = ${teacherId} and sb.assignment_id = ${assignmentId}
  `;
  const roster = await sql<({ class_id: string; active_count: number })[]>`
    select a.class_id,
           (select count(*)::int from students s
            where s.teacher_id = ${teacherId} and s.class_id = a.class_id and s.status = 'active') as active_count
    from assignments a
    where a.teacher_id = ${teacherId} and a.id = ${assignmentId}
  `;
  const counts: SubmissionCounts = {
    total: rows.length,
    notStarted: Math.max(Number(roster[0]?.active_count ?? 0) - rows.length, 0),
    processing: 0,
    needsReview: 0,
    readyToGrade: 0,
    graded: 0,
    failed: 0,
  };
  for (const row of rows) {
    const states = (row.page_states ?? []) as ProcessingState[];
    const processingState = computeDocumentProcessingState(states);
    const reviewState = row.review_state;
    if (states.some((state) => state === 'failed')) {
      counts.failed += 1;
    } else if (processingState !== null && processingState !== 'completed') {
      counts.processing += 1;
    } else if (reviewState === 'ready_to_grade') {
      counts.readyToGrade += 1;
    } else {
      counts.needsReview += 1;
    }
    if (row.grading_state === 'graded') {
      counts.graded += 1;
    }
  }
  return counts;
};

const findCurrentMaterialVersionSummary = async (
  sql: Sql,
  teacherId: string,
  assignmentId: string,
): Promise<MaterialVersionSummary | null> => {
  const rows = await sql<(MaterialVersionRow & { page_count: number | string; page_states: string[] | null })[]>`
    select v.id, v.assignment_id, v.teacher_id, v.version, v.lifecycle,
           v.document_revision, v.draft_confirmed, v.confirmed_at_ms, v.replaced_at_ms,
           v.review_state, v.created_at_ms, v.updated_at_ms,
           (select count(*)::int from pages p where p.materials_version_id = v.id) as page_count,
           (select coalesce(jsonb_agg(p.processing_state order by p.position), '[]'::jsonb)
            from pages p where p.materials_version_id = v.id) as page_states
    from assignment_material_versions v
    where v.teacher_id = ${teacherId} and v.assignment_id = ${assignmentId} and v.lifecycle = 'current'
    limit 1
  `;
  const row = rows[0];
  return row ? mapMaterialVersionSummary(row) : null;
};
