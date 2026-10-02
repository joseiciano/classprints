import type {
  ClassRecord,
  ClassListQuery,
  StudentRecord,
  StudentListQuery,
  AssignmentRecord,
  AssignmentListQuery,
  SubmissionListItem,
  SubmissionListQuery,
  MaterialVersionSummary,
  ProcessingListQuery,
  SavedSeatingChart,
  SeatingChartListQuery,
  DocumentType,
  PageSummary,
} from '@classprints/assignment-reader-shared';
import type { AssignmentReaderRepository } from './assignment-reader.repository';
import type { AssignmentReaderErrorCode, PageRow } from './assignment-reader.types';

/**
 * Assignment Reader service (TASK-007). Owns authorization guards, archived
 * ancestry rules, historical read-only rules, and deletion-pending visibility.
 * Controllers parse input and map errors; this layer decides whether a command
 * is allowed at all (GUD-001). Lifecycle rules stay in the shared transition
 * functions; this layer only sequences authorization and state writes.
 */
export interface AssignmentReaderHttpErrorShape extends Error {
  readonly status: number;
  readonly code: AssignmentReaderErrorCode;
  readonly details?: Array<{ path: string; message: string }>;
}

/** Domain error carrying the manifest's envelope code and HTTP status. */
export class AssignmentReaderError extends Error implements AssignmentReaderHttpErrorShape {
  public readonly status: number;
  public readonly code: AssignmentReaderErrorCode;
  public readonly details?: Array<{ path: string; message: string }>;

  constructor(
    status: number,
    code: AssignmentReaderErrorCode,
    message: string,
    details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = 'AssignmentReaderError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export interface AssignmentReaderServiceDeps {
  repo: AssignmentReaderRepository;
}

export class AssignmentReaderService {
  private readonly deps: AssignmentReaderServiceDeps;

  constructor(deps: AssignmentReaderServiceDeps) {
    this.deps = deps;
  }

  static fromRepository(repo: AssignmentReaderRepository): AssignmentReaderService {
    return new AssignmentReaderService({ repo });
  }

  /** Resolves the owned, writable document context for upload/confirm. */
  private async requireDocumentStatus(
    teacherId: string,
    documentType: DocumentType,
    documentId: string,
  ): Promise<DocumentStatus> {
    const status = await this.deps.repo.findDocumentStatus(teacherId, documentType, documentId);
    if (!status) throw notFound();
    this.assertActiveAncestry(status.class_status, 'modify this document');
    if (documentType === 'materials' && status.lifecycle !== 'draft') {
      // Successful current materials change through a new draft version;
      // historical versions are immutable (REQ-005).
      throw new AssignmentReaderError(409, 'HISTORICAL_VERSION_READ_ONLY', 'This material version is read-only');
    }
    if (documentType === 'submission' && status.lifecycle === 'historical') {
      throw new AssignmentReaderError(409, 'HISTORICAL_VERSION_READ_ONLY', 'This material version is read-only');
    }
    return status;
  }

  private labelFor(status: DocumentStatus, position: number): string {
    const owner = status.student_name ?? 'Materials';
    return `${owner} · Page ${position}`;
  }

  private mapPageSummary(row: PageRow): PageSummary {
    const documentId = row.document_type === 'materials'
      ? row.materials_version_id ?? ''
      : row.submission_id ?? '';
    const failure = failureSummaryOf(row);
    return {
      id: row.id,
      documentType: row.document_type,
      documentId,
      position: row.position,
      label: row.label,
      processingState: row.processing_state,
      attemptCount: row.attempt_count,
      queuedAt: toIso(row.queued_at_ms),
      startedAt: toIso(row.started_at_ms),
      completedAt: toIso(row.completed_at_ms),
      uploadedAt: toIso(row.uploaded_at_ms) as string,
      failure,
      draftAvailable: row.processing_state === 'completed' && row.draft !== null,
      pageRevision: row.page_revision,
      contentRevision: row.content_revision,
      reviewedContentRevision: row.reviewed_content_revision,
      editedByTeacher: row.edited_by_teacher,
      teacherEditCount: row.teacher_edit_count,
    };
  }

  listClasses(teacherId: string, query: ClassListQuery) {
    return this.deps.repo.listClasses({ teacherId, query });
  }

  async getClass(teacherId: string, classId: string): Promise<ClassRecord> {
    const record = await this.deps.repo.findClass(teacherId, classId);
    if (!record) throw notFound();
    return record;
  }

  createClass(teacherId: string, name: string) {
    return this.deps.repo.createClass(teacherId, name);
  }

  async updateClass(
    teacherId: string,
    classId: string,
    patch: { name?: string; status?: 'archived' },
  ): Promise<ClassRecord> {
    const existing = await this.getClass(teacherId, classId);
    if (existing.status === 'archived') {
      // REQ-021: archived classes are read-only. Rename and re-archive both
      // reject; unarchive is out of scope and "active" is never accepted.
      this.assertActiveAncestry(existing.status, 'update an archived class');
    }
    const record = await this.deps.repo.updateClass(teacherId, classId, patch);
    if (!record) throw notFound();
    return record;
  }

  // ——— Students ———————————————————————————————————————————————————————————————

  async listStudents(teacherId: string, classId: string, query: StudentListQuery) {
    // Roster reads require an owned class (404 otherwise); archived ancestry
    // stays readable (manifest §1.1).
    await this.getClass(teacherId, classId);
    return this.deps.repo.listStudents({ teacherId, classId, query });
  }

  async createStudent(teacherId: string, classId: string, name: string): Promise<StudentRecord> {
    const schoolClass = await this.getClass(teacherId, classId);
    this.assertActiveAncestry(schoolClass.status, 'create a roster student');
    return this.deps.repo.createStudent(teacherId, classId, name);
  }

  async updateStudent(
    teacherId: string,
    classId: string,
    studentId: string,
    name: string,
  ): Promise<StudentRecord> {
    const schoolClass = await this.getClass(teacherId, classId);
    this.assertActiveAncestry(schoolClass.status, 'rename a roster student');
    await this.assertStudentInClass(teacherId, classId, studentId);
    const record = await this.deps.repo.updateStudent(teacherId, studentId, name);
    if (!record) throw notFound();
    return record;
  }

  async removeStudent(
    teacherId: string,
    classId: string,
    studentId: string,
  ): Promise<StudentRecord> {
    // Roster removal is non-destructive metadata, so archived ancestry rejects
    // it like any other mutation (api-routes-hierarchy.md §1.9).
    const schoolClass = await this.getClass(teacherId, classId);
    this.assertActiveAncestry(schoolClass.status, 'remove a roster student');
    await this.assertStudentInClass(teacherId, classId, studentId);
    const record = await this.deps.repo.removeStudent(teacherId, studentId);
    if (!record) throw notFound();
    return record;
  }

  // ——— Assignments ————————————————————————————————————————————————————————————

  async listAssignments(teacherId: string, classId: string, query: AssignmentListQuery) {
    await this.getClass(teacherId, classId);
    return this.deps.repo.listAssignments({ teacherId, classId, query });
  }

  async getAssignment(teacherId: string, assignmentId: string): Promise<AssignmentRecord> {
    const record = await this.deps.repo.findAssignment(teacherId, assignmentId);
    if (!record) throw notFound();
    return record;
  }

  async createAssignment(
    teacherId: string,
    classId: string,
    name: string,
    maxScore: number | null,
  ): Promise<AssignmentRecord> {
    const schoolClass = await this.getClass(teacherId, classId);
    this.assertActiveAncestry(schoolClass.status, 'create an assignment');
    return this.deps.repo.createAssignment(teacherId, classId, name, maxScore);
  }

  async updateAssignment(
    teacherId: string,
    assignmentId: string,
    patch: { name?: string; maxScore?: number | null },
  ): Promise<AssignmentRecord> {
    const existing = await this.getAssignment(teacherId, assignmentId);
    this.assertActiveAncestry(existing.classStatus, 'update assignment metadata');
    if (patch.maxScore !== undefined && patch.maxScore !== null && existing.maxScore !== null) {
      if (patch.maxScore < existing.maxScore) {
        // Lowering the maximum below saved scores is rejected; the API never
        // silently changes scores (api-routes-hierarchy.md §2.4).
        const above = await this.deps.repo.countSubmissionsAboveScore(
          teacherId,
          assignmentId,
          patch.maxScore,
        );
        if (above > 0) {
          throw new AssignmentReaderError(
            409,
            'SCORE_EXCEEDS_MAXIMUM',
            'Saved submission scores exceed the new maximum score',
          );
        }
      }
    }
    const record = await this.deps.repo.updateAssignment(teacherId, assignmentId, patch);
    if (!record) throw notFound();
    await this.deps.repo.refreshAssignmentStatus(teacherId, assignmentId);
    return this.getAssignment(teacherId, assignmentId);
  }

  // ——— Materials ——————————————————————————————————————————————————————————————

  async listMaterialVersions(teacherId: string, assignmentId: string, page: number) {
    await this.getAssignment(teacherId, assignmentId);
    return this.deps.repo.listMaterialVersions({ teacherId, assignmentId, page });
  }

  async getMaterialVersion(
    teacherId: string,
    materialVersionId: string,
  ): Promise<MaterialVersionSummary> {
    const record = await this.deps.repo.findMaterialVersion(teacherId, materialVersionId);
    if (!record) throw notFound();
    return record;
  }

  /** Create-or-replay the assignment's draft material version (manifest §1.2). */
  async createDraftMaterialVersion(
    teacherId: string,
    assignmentId: string,
  ): Promise<{ version: MaterialVersionSummary; created: boolean }> {
    const assignment = await this.getAssignment(teacherId, assignmentId);
    this.assertActiveAncestry(assignment.classStatus, 'create a material version');
    const created = await this.deps.repo.createDraftMaterialVersion(teacherId, assignmentId);
    if (created) {
      return { version: created, created: true };
    }
    const existing = await this.deps.repo.findDraftMaterialVersion(teacherId, assignmentId);
    if (!existing) throw new AssignmentReaderError(500, 'INVALID_STATE', 'Unable to create material version');
    return { version: existing, created: false };
  }

  // ——— Processing (TASK-008) ——————————————————————————————————————————————————

  /**
   * Per-page canonical list for one document (api-routes-documents.md §3.1).
   * The service resolves the document's identity and ownership through the
   * same material/submission finders as every other read, so a foreign or
   * deletion-pending document id is indistinguishable from a missing one;
   * archived ancestry stays readable, and historical material versions
   * remain listed read-only for later-phase workspace wiring.
   */
  async listProcessing(
    teacherId: string,
    documentType: 'materials' | 'submission',
    documentId: string,
    query: ProcessingListQuery,
  ) {
    if (documentType === 'materials') {
      const version = await this.deps.repo.findMaterialVersion(teacherId, documentId);
      if (!version) throw notFound();
    } else {
      const submission = await this.deps.repo.findSubmission(teacherId, documentId);
      if (!submission) throw notFound();
    }
    return this.deps.repo.listProcessing({ teacherId, documentType, documentId, query });
  }


  // ——— Submissions ————————————————————————————————————————————————————————————

  async listSubmissions(
    teacherId: string,
    assignmentId: string,
    query: SubmissionListQuery,
  ): Promise<ListResponseOf<SubmissionListItem>> {
    await this.getAssignment(teacherId, assignmentId);
    return this.deps.repo.listSubmissions({ teacherId, assignmentId, query });
  }

  async getSubmission(teacherId: string, submissionId: string) {
    const record = await this.deps.repo.findSubmission(teacherId, submissionId);
    if (!record) throw notFound();
    return record;
  }

  /** Create-or-return the student's submission (REQ-006, manifest §1.6). */
  async createSubmission(
    teacherId: string,
    assignmentId: string,
    studentId: string,
  ): Promise<{ submission: Awaited<ReturnType<AssignmentReaderRepository['findSubmission']>>; created: boolean }> {
    const assignment = await this.getAssignment(teacherId, assignmentId);
    this.assertActiveAncestry(assignment.classStatus, 'create a submission');
    const student = await this.deps.repo.findStudent(teacherId, studentId);
    if (!student) throw notFound();
    if (student.classId !== assignment.classId) {
      // Student must belong to the assignment's class (manifest §1.6).
      throw notFound();
    }
    if (student.status !== 'active') {
      throw new AssignmentReaderError(
        409,
        'INVALID_STATE',
        'Student is not on the active roster',
      );
    }
    return this.deps.repo.createSubmission(teacherId, assignmentId, studentId);
  }

  // ——— Seating charts (TASK-009) ——————————————————————————————————————————————

  async listSavedSeatingCharts(
    teacherId: string,
    classId: string,
    query: SeatingChartListQuery,
  ): Promise<ListResponseOf<SavedSeatingChart>> {
    // The class list (hierarchy contract §2.6) requires an owned class like
    // every other class-scoped read; a foreign classId is a 404, not an
    // empty list (SEC-001).
    await this.getClass(teacherId, classId);
    return this.deps.repo.listSavedSeatingCharts(teacherId, classId, query);
  }

  async getSavedSeatingChart(teacherId: string, chartId: string): Promise<SavedSeatingChart> {
    const chart = await this.deps.repo.findSavedSeatingChart(teacherId, chartId);
    if (!chart) throw notFound();
    return chart;
  }

  /**
   * Save a seating result to a class (TASK-009). Verifies the teacher owns
   * the source job, the selected numeric result, and the destination class;
   * rejects archived classes; copies the selected grid rather than
   * referencing mutable result data. Idempotent per (class, source job).
   */
  async saveSeatingChartToClass(
    teacherId: string,
    externalId: string,
    classId: string,
    resultId: number,
  ): Promise<{ chart: SavedSeatingChart; created: boolean }> {
    const job = await this.deps.repo.findSeatingJobByExternalId(teacherId, externalId);
    if (!job) throw notFound();
    const result = await this.deps.repo.findSeatingResult(job.id, resultId);
    if (!result) throw notFound();
    const schoolClass = await this.getClass(teacherId, classId);
    this.assertActiveAncestry(schoolClass.status, 'save a seating chart');

    const replay = await this.deps.repo.findSavedSeatingChartByJob(teacherId, classId, externalId);
    if (replay) {
      return { chart: replay, created: false };
    }
    const studentCount = countSeatedStudents(result.arrangement);
    const chart = await this.deps.repo.saveSeatingChart({
      teacherId,
      classId,
      sourceJobExternalId: externalId,
      sourceResultId: result.id,
      grid: result.arrangement,
      studentCount,
    });
    return { chart, created: true };
  }

  // ——— Guards ——————————————————————————————————————————————————————————————————

  private assertActiveAncestry(status: string, action: string): void {
    if (status === 'archived') {
      throw new AssignmentReaderError(
        409,
        'ARCHIVED_ANCESTRY',
        `Archived classes are read-only; cannot ${action}`,
      );
    }
  }

  private async assertStudentInClass(
    teacherId: string,
    classId: string,
    studentId: string,
  ): Promise<void> {
    const student = await this.deps.repo.findStudent(teacherId, studentId);
    if (!student || student.classId !== classId) throw notFound();
  }
}

type DocumentStatus = import('./assignment-reader.types').DocumentStatusRow;

const toIso = (value: number | string | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  return new Date(numeric).toISOString();
};


const failureSummaryOf = (row: PageRow): import('@classprints/assignment-reader-shared').SafeFailure | null => {
  const code = row.failure_code;
  if (!code) return null;
  const guidance: Record<string, { message: string; retryAllowed: boolean; replacementRecommended: boolean }> = {
    provider_timeout: { message: 'Transcription timed out; retry this page.', retryAllowed: true, replacementRecommended: false },
    provider_rejected: { message: 'The transcription provider rejected this page; retry, or replace the page image.', retryAllowed: true, replacementRecommended: true },
    invalid_output: { message: 'Transcription output was invalid; retry this page.', retryAllowed: true, replacementRecommended: false },
    storage_failure: { message: 'The page image could not be stored; replace this page.', retryAllowed: false, replacementRecommended: true },
    invalid_image: { message: 'The page image is not a supported image; replace this page.', retryAllowed: false, replacementRecommended: true },
  };
  const safe = guidance[code];
  return safe
    ? { code: code as import('@classprints/assignment-reader-shared').FailureCode, ...safe }
    : null;
};

type ListResponseOf<T> = import('@classprints/assignment-reader-shared').ListResponse<T>;

const notFound = () =>
  new AssignmentReaderError(404, 'RESOURCE_NOT_FOUND', 'Resource not found');

const countSeatedStudents = (grid: Array<Array<string | null>>): number =>
  grid.reduce((count, row) => count + row.filter((name) => Boolean(name?.trim())).length, 0);
