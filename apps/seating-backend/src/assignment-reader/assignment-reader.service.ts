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
  ConfirmDocumentResult,
  ReplacePageResult,
  RetryPageResult,
  RetranscribeDocumentBody,
  DocumentProcessingResponse,
  DeletionOperation,
  DeletionTargetType,
  ImageVariant,
  Rotation,
  ProcessingState,
  TranscriptionPageMessage,
  DeletionOperationMessage,
  DocumentWorkspace,
  DocumentAction,
  PageWorkspace,
  AssignmentDraft,
  QuestionSegment,
  UpdatePageDraftBody,
  ReviewPageBody,
  ReviewPageResult,
  DocumentRevisionCommandBody,
  DocumentStateResult,
  UpdateQuestionJudgmentBody,
  QuestionJudgment,
  UpdateGradingDraftBody,
  GradingDraft,
  QuestionPointsTotalQuery,
  QuestionPointsTotal,
  ApplyQuestionPointsBody,
} from '@classprints/assignment-reader-shared';
import {
  computeDocumentProcessingState,
  computeProcessingCounts,
  isPageRetryEligible,
  canRetranscribeDocument,
  evaluateRetranscriptionConsent,
} from '@classprints/assignment-reader-shared';
import type { AssignmentReaderRepository } from './assignment-reader.repository';
import type {
  AssignmentReaderErrorCode,
  DeletionOperationRow,
  GradingDraftRow,
  PageRow,
  QuestionSegmentWithJudgmentRow,
} from './assignment-reader.types';
import {
  MAX_UPLOAD_BYTES,
  storageKeyFor,
  UnsupportedImageError,
  MalformedImageError,
  type PageImageRepository,
  type RegionCrop,
  type ImageByteStream,
} from './page-image.repository';

/** Queue-send abstraction (TASK-011): the service orchestrates DB commits
 * and best-effort queue delivery; routes.ts supplies the real Worker queue
 * bindings so this file never imports Cloudflare binding types directly. */
export interface AssignmentReaderQueues {
  sendTranscriptionPage(message: TranscriptionPageMessage): Promise<void>;
  sendDeletionOperation(message: DeletionOperationMessage): Promise<void>;
}

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
  readonly context?: Record<string, unknown>;
}

/** Domain error carrying the manifest's envelope code and HTTP status. */
export class AssignmentReaderError extends Error implements AssignmentReaderHttpErrorShape {
  public readonly status: number;
  public readonly code: AssignmentReaderErrorCode;
  public readonly details?: Array<{ path: string; message: string }>;
  /** Safe, non-content machine-readable context for a 409 response — for
   * example REVISION_CONFLICT's current revision or CONSENT_REQUIRED's
   * missing-consent issue codes (api-routes-documents.md §3.4). */
  public readonly context?: Record<string, unknown>;

  constructor(
    status: number,
    code: AssignmentReaderErrorCode,
    message: string,
    details?: Array<{ path: string; message: string }>,
    context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AssignmentReaderError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.context = context;
  }
}
export interface AssignmentReaderServiceDeps {
  repo: AssignmentReaderRepository;
  /** Required for upload/replace/image-delivery (TASK-010/TASK-012); every
   * other method works without it. */
  images?: PageImageRepository;
  /** Required for confirm/retry-confirm/replace (TASK-011). */
  queues?: AssignmentReaderQueues;
}

export class AssignmentReaderService {
  private readonly deps: AssignmentReaderServiceDeps;

  constructor(deps: AssignmentReaderServiceDeps) {
    this.deps = deps;
  }

  static fromRepository(repo: AssignmentReaderRepository): AssignmentReaderService {
    return new AssignmentReaderService({ repo });
  }

  private requireImages(): PageImageRepository {
    if (!this.deps.images) throw new Error('AssignmentReaderService: images dependency is required');
    return this.deps.images;
  }

  private requireQueues(): AssignmentReaderQueues {
    if (!this.deps.queues) throw new Error('AssignmentReaderService: queues dependency is required');
    return this.deps.queues;
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

  private ownerLabelOf(status: DocumentStatus): string {
    return status.student_name ?? 'Materials';
  }

  /** Looser guard for retry-confirm (api-routes-documents.md §2.6): any
   * non-historical, owned, active-ancestry document — unlike
   * `requireDocumentStatus`, a materials version already promoted to
   * `current` by its own confirm is still eligible. */
  private async requireNonHistoricalDocumentStatus(
    teacherId: string,
    documentType: DocumentType,
    documentId: string,
  ): Promise<DocumentStatus> {
    const status = await this.deps.repo.findDocumentStatus(teacherId, documentType, documentId);
    if (!status) throw notFound();
    this.assertActiveAncestry(status.class_status, 'modify this document');
    if (status.lifecycle === 'historical') {
      throw new AssignmentReaderError(409, 'HISTORICAL_VERSION_READ_ONLY', 'This material version is read-only');
    }
    return status;
  }

  private parentIdOf(row: PageRow): string {
    return row.document_type === 'materials' ? (row.materials_version_id ?? '') : (row.submission_id ?? '');
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

  // ——— Processing, retry, and retranscription (TASK-015) ———————————————————————

  /**
   * Per-page canonical list for one document (api-routes-documents.md §3.1).
   * The service resolves the document's identity and ownership through the
   * same material/submission finders as every other read, so a foreign or
   * deletion-pending document id is indistinguishable from a missing one;
   * archived ancestry stays readable, and historical material versions
   * remain listed read-only for later-phase workspace wiring.
   *
   * The document-level rollup fields (`processingState`, `processingCounts`,
   * `reviewState`, `documentRevision`) come from the same finder's full,
   * unfiltered page-state aggregate, never from the paginated/filtered page
   * list below it — a search/status filter or a later page must not change
   * what the rollup reports (REQ-010).
   */
  async listProcessing(
    teacherId: string,
    documentType: DocumentType,
    documentId: string,
    query: ProcessingListQuery,
  ): Promise<DocumentProcessingResponse> {
    const aggregate =
      documentType === 'materials'
        ? await this.deps.repo.findMaterialVersion(teacherId, documentId)
        : await this.deps.repo.findSubmission(teacherId, documentId);
    if (!aggregate) throw notFound();
    const list = await this.deps.repo.listProcessing({ teacherId, documentType, documentId, query });
    return {
      ...list,
      documentType,
      documentId,
      documentRevision: aggregate.documentRevision,
      processingState: aggregate.processingState,
      processingCounts: aggregate.processingCounts,
      reviewState: aggregate.reviewState,
    };
  }

  /**
   * Retries exactly one failed page (api-routes-documents.md §3.3). Only a
   * page that is currently `failed` is eligible (REQ-013/ALT-006): default
   * recovery never re-bills or reprocesses successful siblings. The
   * repository's conditional update is the real race guard; this
   * pre-check only produces the right 404 vs. 409 before it.
   */
  async retryPage(teacherId: string, pageId: string): Promise<RetryPageResult> {
    const page = await this.deps.repo.findPage(teacherId, pageId);
    if (!page) throw notFound();
    if (!isPageRetryEligible({ processingState: page.processing_state })) {
      throw new AssignmentReaderError(409, 'INVALID_STATE', 'Only a failed page can be retried');
    }
    const documentType = page.document_type;
    const documentId = this.parentIdOf(page);
    // Looser guard than requireDocumentStatus (api-routes-documents.md §3.3
    // applies to a confirmed/current document, not only a draft materials
    // version): active ancestry, owned, non-historical, not deletion-pending.
    await this.requireNonHistoricalDocumentStatus(teacherId, documentType, documentId);

    const result = await this.deps.repo.retryPageRow(teacherId, pageId);
    if (!result) {
      // Pre-commit race: the page stopped being exactly `failed` between the
      // check above and the conditional write. Nothing changed.
      throw new AssignmentReaderError(409, 'INVALID_STATE', 'This page changed; refresh and try again');
    }

    const queues = this.requireQueues();
    try {
      await queues.sendTranscriptionPage({
        kind: 'transcription_page',
        pageId: result.page.id,
        transcriptionRevision: result.page.page_revision,
        documentType,
        attemptCount: 0,
        queuedAtMs: Date.now(),
        isRetry: true,
      });
    } catch (error) {
      console.error('retryPage: transcription queue send failed', { pageId, error });
      // The new revision is already committed; delivery recovers through
      // retry-confirm (api-routes-documents.md §2.6), never a second retry.
      throw new AssignmentReaderError(
        500,
        'QUEUE_DELIVERY_FAILED',
        'Retry committed, but transcription delivery failed; use retry-confirm',
      );
    }

    const siblings = await this.deps.repo.listDocumentPageRows(teacherId, documentType, documentId);
    const pageStates = siblings.map((row) => row.processing_state);
    return {
      page: this.mapPageSummary(result.page),
      documentRevision: result.documentRevision,
      documentProcessingState: (computeDocumentProcessingState(pageStates) ?? 'queued') as ProcessingState,
      processingCounts: computeProcessingCounts(pageStates),
    };
  }

  /**
   * Whole-document retranscription (api-routes-documents.md §3.4): the
   * explicit, separately-confirmed alternative to page retry (ALT-006). Every
   * current page must already be `completed`; `expectedDocumentRevision` is a
   * compare-and-swap guard, and missing teacher-edit/judgment-reset consent
   * blocks the command before anything commits (REQ-013, PAT-004).
   */
  async retranscribeDocument(
    teacherId: string,
    documentType: DocumentType,
    documentId: string,
    body: RetranscribeDocumentBody,
  ): Promise<ConfirmDocumentResult> {
    const status = await this.requireNonHistoricalDocumentStatus(teacherId, documentType, documentId);
    if (!status.draft_confirmed) {
      throw new AssignmentReaderError(409, 'INVALID_STATE', 'This document is not confirmed');
    }
    const currentPages = await this.deps.repo.listDocumentPageRows(teacherId, documentType, documentId);
    if (currentPages.length === 0) {
      throw new AssignmentReaderError(409, 'INVALID_STATE', 'This document has no pages to retranscribe');
    }
    const pageStates = currentPages.map((row) => row.processing_state);
    if (!canRetranscribeDocument(pageStates)) {
      throw new AssignmentReaderError(
        409,
        'INVALID_STATE',
        'Every current page must be completed before retranscription',
      );
    }
    if (body.expectedDocumentRevision !== status.document_revision) {
      throw new AssignmentReaderError(
        409,
        'REVISION_CONFLICT',
        'This document changed since it was loaded',
        undefined,
        { currentRevision: status.document_revision },
      );
    }
    const anyPageEditedByTeacher = currentPages.some((row) => row.edited_by_teacher);
    const submissionHasJudgments =
      documentType === 'submission'
        ? await this.deps.repo.hasCurrentQuestionJudgments(teacherId, documentId)
        : false;
    const issues = evaluateRetranscriptionConsent({
      confirmed: body.confirmed,
      anyPageEditedByTeacher,
      overwriteTeacherEdits: body.overwriteTeacherEdits,
      submissionHasJudgments,
      resetQuestionJudgments: body.resetQuestionJudgments,
    });
    if (issues.length > 0) {
      throw new AssignmentReaderError(
        409,
        'CONSENT_REQUIRED',
        'Retranscription requires explicit consent',
        undefined,
        { issues },
      );
    }

    const result = await this.deps.repo.retranscribeDocumentRows({
      teacherId,
      documentType,
      documentId,
      expectedDocumentRevision: body.expectedDocumentRevision,
    });
    if (!result) {
      // The revision moved between the pre-check above and the conditional
      // write (another committed mutation); nothing from this call committed.
      throw new AssignmentReaderError(
        409,
        'REVISION_CONFLICT',
        'This document changed since it was loaded',
      );
    }

    const queues = this.requireQueues();
    let queueFailed = false;
    for (const row of result.pages) {
      try {
        await queues.sendTranscriptionPage({
          kind: 'transcription_page',
          pageId: row.id,
          transcriptionRevision: row.page_revision,
          documentType,
          attemptCount: 0,
          queuedAtMs: Date.now(),
          isRetry: true,
        });
      } catch (error) {
        queueFailed = true;
        console.error('retranscribeDocument: transcription queue send failed', { pageId: row.id, error });
      }
    }
    const pages = result.pages.map((row) => this.mapPageSummary(row));
    const states = pages.map((page) => page.processingState);
    if (queueFailed) {
      throw new AssignmentReaderError(
        500,
        'QUEUE_DELIVERY_FAILED',
        'Retranscription committed, but delivery failed for one or more pages; use retry-confirm',
      );
    }
    return {
      documentType,
      documentId,
      documentRevision: result.documentRevision,
      pages,
      processingState: (computeDocumentProcessingState(states) ?? 'queued') as ProcessingState,
      processingCounts: computeProcessingCounts(states),
      acceptedAt: new Date().toISOString(),
    };
  }

  // ——— Pages: upload, ordering, replacement, removal, delivery (TASK-010/011/012) ———

  /** One-file upload for a material-version or submission page
   * (api-routes-documents.md §2.1/§2.2). The canonical JPEG is written to R2
   * before the page row exists; a page-limit race or unexpected DB failure
   * after a successful R2 write compensates by deleting that object so no
   * blob is ever orphaned (TASK-010 acceptance). */
  async uploadPage(
    teacherId: string,
    documentType: DocumentType,
    documentId: string,
    fileBytes: ArrayBuffer,
  ): Promise<PageSummary> {
    const status = await this.requireDocumentStatus(teacherId, documentType, documentId);
    if (fileBytes.byteLength === 0) {
      throw new AssignmentReaderError(400, 'INVALID_MULTIPART', 'A non-empty file is required');
    }
    if (fileBytes.byteLength > MAX_UPLOAD_BYTES) {
      throw new AssignmentReaderError(413, 'IMAGE_TOO_LARGE', 'Image exceeds the 10 MB limit');
    }
    const images = this.requireImages();
    const pageId = crypto.randomUUID();
    const storageKey = storageKeyFor({
      teacherId,
      classId: status.class_id,
      assignmentId: status.assignment_id,
      documentType,
      pageId,
    });
    try {
      await images.storeNormalizedImage({ bytes: fileBytes, storageKey });
    } catch (error) {
      if (error instanceof UnsupportedImageError || error instanceof MalformedImageError) {
        throw new AssignmentReaderError(415, 'UNSUPPORTED_IMAGE', error.message);
      }
      throw error;
    }
    let row: PageRow | null;
    try {
      row = await this.deps.repo.insertPageRow({
        id: pageId,
        teacherId,
        documentType,
        materialsVersionId: documentType === 'materials' ? documentId : null,
        submissionId: documentType === 'submission' ? documentId : null,
        studentId: status.student_id,
        classId: status.class_id,
        assignmentId: status.assignment_id,
        ownerLabel: this.ownerLabelOf(status),
        storageKey,
      });
    } catch (error) {
      await images.deleteObject(storageKey);
      throw error;
    }
    if (!row) {
      await images.deleteObject(storageKey);
      throw new AssignmentReaderError(409, 'PAGE_LIMIT_EXCEEDED', 'This document already has 20 pages');
    }
    return this.mapPageSummary(row);
  }

  /** Confirms the complete ordered current page set and begins transcription
   * (api-routes-documents.md §2.5). */
  async confirmDocument(
    teacherId: string,
    documentType: DocumentType,
    documentId: string,
    pageIds: string[],
  ): Promise<ConfirmDocumentResult> {
    const status = await this.requireDocumentStatus(teacherId, documentType, documentId);
    if (status.draft_confirmed) {
      throw new AssignmentReaderError(409, 'INVALID_STATE', 'This document is already confirmed');
    }
    if (new Set(pageIds).size !== pageIds.length) {
      throw new AssignmentReaderError(400, 'INVALID_REQUEST', 'Page IDs must be unique', [
        { path: 'pageIds', message: 'Duplicate page ID' },
      ]);
    }
    const currentPages = await this.deps.repo.listDocumentPageRows(teacherId, documentType, documentId);
    if (currentPages.length === 0) {
      throw new AssignmentReaderError(409, 'INVALID_STATE', 'This document has no pages to confirm');
    }
    const currentIds = new Set(currentPages.map((page) => page.id));
    const suppliedIds = new Set(pageIds);
    const sameSet =
      currentIds.size === suppliedIds.size && [...suppliedIds].every((id) => currentIds.has(id));
    if (!sameSet) {
      throw new AssignmentReaderError(
        409,
        'INVALID_STATE',
        'The supplied page IDs must match the current page set exactly',
      );
    }
    const storedOrder = currentPages
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((page) => page.id);
    const orderChanged = storedOrder.join(',') !== pageIds.join(',');

    const result = await this.deps.repo.confirmDocumentOrder({
      teacherId,
      documentType,
      documentId,
      orderedPageIds: pageIds,
      orderChanged,
    });
    if (documentType === 'materials') {
      await this.deps.repo.promoteDraftMaterials(teacherId, documentId);
    }

    const queues = this.requireQueues();
    let queueFailed = false;
    for (const seed of result.queuedSeeds) {
      try {
        await queues.sendTranscriptionPage({
          kind: 'transcription_page',
          pageId: seed.pageId,
          transcriptionRevision: seed.pageRevision,
          documentType,
          attemptCount: 0,
          queuedAtMs: Date.now(),
          isRetry: false,
        });
      } catch (error) {
        queueFailed = true;
        console.error('confirmDocument: transcription queue send failed', { pageId: seed.pageId, error });
      }
    }

    const pages = result.pages.map((row) => this.mapPageSummary(row));
    const pageStates = pages.map((page) => page.processingState);
    const processingState = computeDocumentProcessingState(pageStates);
    if (queueFailed) {
      throw new AssignmentReaderError(
        500,
        'QUEUE_DELIVERY_FAILED',
        'Confirmed, but transcription delivery failed for one or more pages; use retry-confirm',
      );
    }
    return {
      documentType,
      documentId,
      documentRevision: result.documentRevision,
      pages,
      processingState: (processingState ?? 'queued') as ProcessingState,
      processingCounts: computeProcessingCounts(pageStates),
      acceptedAt: new Date().toISOString(),
    };
  }

  /** Resends transcription queue messages for current queued pages with no
   * accepted worker execution yet (api-routes-documents.md §2.6) — recovery
   * for a prior QUEUE_DELIVERY_FAILED, never a second confirmation. */
  async retryConfirmDocument(
    teacherId: string,
    documentType: DocumentType,
    documentId: string,
  ): Promise<ConfirmDocumentResult> {
    await this.requireNonHistoricalDocumentStatus(teacherId, documentType, documentId);
    const eligible = await this.deps.repo.listQueuedUndeliveredPages(teacherId, documentType, documentId);
    if (eligible.length === 0) {
      throw new AssignmentReaderError(
        409,
        'INVALID_STATE',
        'No queued page is awaiting delivery',
      );
    }
    const queues = this.requireQueues();
    let queueFailed = false;
    for (const page of eligible) {
      try {
        await queues.sendTranscriptionPage({
          kind: 'transcription_page',
          pageId: page.id,
          transcriptionRevision: page.page_revision,
          documentType,
          attemptCount: 0,
          queuedAtMs: Date.now(),
          isRetry: true,
        });
      } catch (error) {
        queueFailed = true;
        console.error('retryConfirmDocument: transcription queue send failed', { pageId: page.id, error });
      }
    }
    if (queueFailed) {
      throw new AssignmentReaderError(500, 'QUEUE_DELIVERY_FAILED', 'Delivery failed for one or more pages');
    }
    const allPages = await this.deps.repo.listDocumentPageRows(teacherId, documentType, documentId);
    const pages = allPages.map((row) => this.mapPageSummary(row));
    const pageStates = pages.map((page) => page.processingState);
    const status = await this.deps.repo.findDocumentStatus(teacherId, documentType, documentId);
    return {
      documentType,
      documentId,
      documentRevision: status?.document_revision ?? 0,
      pages,
      processingState: (computeDocumentProcessingState(pageStates) ?? 'queued') as ProcessingState,
      processingCounts: computeProcessingCounts(pageStates),
      acceptedAt: new Date().toISOString(),
    };
  }

  /** Replaces one page's image (api-routes-documents.md §2.3): an
   * unconfirmed page in any state, or a confirmed page that is exactly
   * `failed` (recovery). Any other confirmed state is 409 INVALID_STATE. */
  async replacePage(teacherId: string, pageId: string, fileBytes: ArrayBuffer): Promise<ReplacePageResult> {
    const page = await this.deps.repo.findPage(teacherId, pageId);
    if (!page) throw notFound();
    const parentId = this.parentIdOf(page);
    const status = await this.deps.repo.findDocumentStatus(teacherId, page.document_type, parentId);
    if (!status) throw notFound();
    if (page.document_type === 'materials' && status.lifecycle === 'historical') {
      throw new AssignmentReaderError(409, 'HISTORICAL_VERSION_READ_ONLY', 'This material version is read-only');
    }
    this.assertActiveAncestry(status.class_status, 'replace a page');

    let requeueImmediately: boolean;
    if (page.processing_state === 'uploading') {
      requeueImmediately = false;
    } else if (page.processing_state === 'failed') {
      requeueImmediately = true;
    } else {
      throw new AssignmentReaderError(
        409,
        'INVALID_STATE',
        'Only an unconfirmed or failed page can be replaced',
      );
    }
    if (fileBytes.byteLength === 0) {
      throw new AssignmentReaderError(400, 'INVALID_MULTIPART', 'A non-empty file is required');
    }
    if (fileBytes.byteLength > MAX_UPLOAD_BYTES) {
      throw new AssignmentReaderError(413, 'IMAGE_TOO_LARGE', 'Image exceeds the 10 MB limit');
    }

    const images = this.requireImages();
    const newPageId = crypto.randomUUID();
    const storageKey = storageKeyFor({
      teacherId,
      classId: page.class_id,
      assignmentId: page.assignment_id,
      documentType: page.document_type,
      pageId: newPageId,
    });
    try {
      await images.storeNormalizedImage({ bytes: fileBytes, storageKey });
    } catch (error) {
      if (error instanceof UnsupportedImageError || error instanceof MalformedImageError) {
        throw new AssignmentReaderError(415, 'UNSUPPORTED_IMAGE', error.message);
      }
      throw error;
    }

    let result;
    try {
      result = await this.deps.repo.replacePageRow({
        id: newPageId,
        teacherId,
        documentType: page.document_type,
        materialsVersionId: page.materials_version_id,
        submissionId: page.submission_id,
        studentId: page.student_id,
        classId: page.class_id,
        assignmentId: page.assignment_id,
        replacedPageId: pageId,
        position: page.position,
        pageRevision: page.page_revision + 1,
        label: page.label,
        storageKey,
        requeueImmediately,
      });
    } catch (error) {
      await images.deleteObject(storageKey);
      throw error;
    }

    const queues = this.requireQueues();
    const deletionOperation = await this.deps.repo.createDeletionOperation({
      teacherId,
      targetType: 'page',
      targetId: pageId,
      storageKeys: [result.replacedStorageKey],
    });
    try {
      await queues.sendDeletionOperation({
        kind: 'deletion_operation',
        operationId: deletionOperation.id,
        targetType: 'page',
      });
    } catch (error) {
      // The old blob stays scheduled for cleanup (deletion_operations row
      // already committed); a later delivery or operator replay finishes it.
      console.error('replacePage: cleanup queue send failed', { operationId: deletionOperation.id, error });
    }

    if (requeueImmediately) {
      try {
        await queues.sendTranscriptionPage({
          kind: 'transcription_page',
          pageId: newPageId,
          transcriptionRevision: page.page_revision + 1,
          documentType: page.document_type,
          attemptCount: 0,
          queuedAtMs: Date.now(),
          isRetry: true,
        });
      } catch (error) {
        console.error('replacePage: transcription queue send failed', { pageId: newPageId, error });
        throw new AssignmentReaderError(500, 'QUEUE_DELIVERY_FAILED', 'Replacement saved but delivery failed');
      }
    }

    return {
      page: this.mapPageSummary(result.page),
      replacedPageId: pageId,
      deletionOperationId: deletionOperation.id,
      documentRevision: result.documentRevision,
    };
  }

  /** Removes a page from a draft material version or a submission
   * (api-routes-documents.md §2.4). A page on current successful materials
   * requires a new draft version instead.
   *
   * A delete route must check for a pending operation on this target before
   * looking up the now-hidden target (api-routes-documents.md §2.4 general
   * rule): once the row is physically deleted, `findPage` can no longer
   * distinguish "already deleted, replay" from "never existed", so the
   * pending-operation check runs first and short-circuits to the replay
   * response before any lookup that depends on the row still existing. */
  async removePage(teacherId: string, pageId: string): Promise<{ operation: DeletionOperation; created: boolean }> {
    const pending = await this.deps.repo.findPendingDeletionOperation(teacherId, 'page', pageId);
    if (pending) {
      return {
        operation: {
          id: pending.id,
          targetType: 'page',
          targetId: pageId,
          status: 'pending',
          acceptedAt: toIso(pending.accepted_at_ms) as string,
        },
        created: false,
      };
    }
    const page = await this.deps.repo.findPage(teacherId, pageId);
    if (!page) throw notFound();
    const parentId = this.parentIdOf(page);
    const status = await this.deps.repo.findDocumentStatus(teacherId, page.document_type, parentId);
    if (!status) throw notFound();
    if (page.document_type === 'materials') {
      if (status.lifecycle === 'historical') {
        throw new AssignmentReaderError(409, 'HISTORICAL_VERSION_READ_ONLY', 'This material version is read-only');
      }
      if (status.lifecycle !== 'draft') {
        throw new AssignmentReaderError(
          409,
          'INVALID_STATE',
          'A page on current materials requires a new draft version',
        );
      }
    }
    // Deletion is allowed under archived ancestry (api-routes-documents §2.4);
    // no assertActiveAncestry call here, unlike every other page mutation.
    const removed = await this.deps.repo.removePageRow(teacherId, pageId);
    if (!removed) throw notFound();

    const deletionOperation = await this.deps.repo.createDeletionOperation({
      teacherId,
      targetType: 'page',
      targetId: pageId,
      storageKeys: [removed.removedStorageKey],
    });
    try {
      await this.requireQueues().sendDeletionOperation({
        kind: 'deletion_operation',
        operationId: deletionOperation.id,
        targetType: 'page',
      });
    } catch (error) {
      console.error('removePage: cleanup queue send failed', { operationId: deletionOperation.id, error });
    }
    return {
      operation: {
        id: deletionOperation.id,
        targetType: 'page',
        targetId: pageId,
        status: 'pending',
        acceptedAt: toIso(deletionOperation.accepted_at_ms) as string,
      },
      created: true,
    };
  }

  /** Renders one authenticated page-image variant (api-routes-documents.md
   * §2.7). Historical pages and pages under archived ancestry remain
   * readable; ownership is the only gate. */
  async getPageImage(
    teacherId: string,
    pageId: string,
    variant: ImageVariant,
    rotation: Rotation,
    region: RegionCrop | null,
  ): Promise<{ stream: ImageByteStream; contentType: string }> {
    const source = await this.deps.repo.findPageImageSource(teacherId, pageId);
    if (!source) throw notFound();
    const rendered = await this.requireImages().renderVariant({
      storageKey: source.storage_key,
      variant,
      rotation,
      region,
    });
    if (!rendered) throw notFound();
    return { stream: rendered.body, contentType: rendered.contentType };
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

  // ——— Workspace, review, and grading (TASK-016/TASK-017) ———————————————————

  private mapQuestionSegment(row: QuestionSegmentWithJudgmentRow): QuestionSegment {
    return {
      id: row.id,
      pageId: row.page_id,
      pageRevision: row.page_revision,
      ordinal: row.ordinal,
      label: row.label,
      questionText: row.question_text,
      responseText: row.response_text,
      judgment: {
        segmentId: row.id,
        judgment: row.judgment ?? 'unmarked',
        awardedPoints: toNumber(row.awarded_points),
        comment: row.comment,
        updatedAt: toIso(row.judgment_updated_at_ms),
      },
    };
  }

  /** Advisory-only action list (api-routes-review.md "Shared state and
   * revision rules"): every mutation route re-enforces its own precondition
   * independently, so an inaccurate entry here can never unlock a command
   * the server would otherwise reject. Historical material versions carry no
   * actions; archived ancestry keeps only `delete`, the one mutation the
   * manifest exempts from the archived-ancestry prohibition. */
  private computeWorkspaceActions(input: {
    documentType: DocumentType;
    historical: boolean;
    archived: boolean;
    pageCount: number;
    processingState: ProcessingState | null;
    reviewState: import('@classprints/assignment-reader-shared').ReviewState | null;
    gradingState: import('@classprints/assignment-reader-shared').GradingState | null;
  }): DocumentAction[] {
    if (input.historical) return [];
    if (input.archived) return ['delete'];
    const actions: DocumentAction[] = ['upload_page', 'delete'];
    const unconfirmed = input.pageCount === 0 || (input.processingState === null && input.reviewState === null);
    if (input.pageCount > 0) {
      if (unconfirmed) {
        actions.push('confirm');
      } else {
        actions.push('retry_page', 'replace_page');
        if (input.processingState === 'completed') {
          actions.push('retranscribe', 'edit_draft', 'review_page');
        }
      }
    }
    if (input.reviewState === 'needs_review') actions.push('mark_ready');
    if (input.reviewState === 'ready_to_grade') actions.push('return_to_needs_review');
    if (input.documentType === 'submission') {
      const gradingOpen =
        input.gradingState === 'not_graded' &&
        (input.reviewState === 'needs_review' || input.reviewState === 'ready_to_grade');
      if (gradingOpen) actions.push('edit_grading', 'edit_question_judgments');
      if (input.reviewState === 'ready_to_grade' && input.gradingState === 'not_graded') {
        actions.push('mark_graded');
      }
    }
    return actions;
  }

  /** GET /documents/:documentType/:documentId/workspace
   * (api-routes-review.md §1.1). Historical material-version workspaces and
   * ones under archived ancestry remain readable with `readOnly: true` and
   * an empty-or-delete-only `allowedActions`. */
  async getWorkspace(
    teacherId: string,
    documentType: DocumentType,
    documentId: string,
  ): Promise<DocumentWorkspace> {
    if (documentType === 'materials') {
      const materialVersion = await this.deps.repo.findMaterialVersion(teacherId, documentId);
      if (!materialVersion) throw notFound();
      const assignment = await this.getAssignment(teacherId, materialVersion.assignmentId);
      const pages = await this.deps.repo.listDocumentPageRows(teacherId, 'materials', documentId);
      const historical = materialVersion.lifecycle === 'historical';
      const archived = assignment.classStatus === 'archived';
      return {
        documentType: 'materials',
        documentId,
        class: { id: assignment.classId, name: assignment.className, status: assignment.classStatus },
        assignment: { id: assignment.id, name: assignment.name, maxScore: assignment.maxScore },
        student: null,
        materialVersion,
        submission: null,
        pages: pages.map((row) => this.mapPageSummary(row)),
        processingState: materialVersion.processingState,
        processingCounts: materialVersion.processingCounts,
        reviewState: materialVersion.reviewState,
        gradingState: null,
        documentRevision: materialVersion.documentRevision,
        reviewContext: null,
        reviewContextCaptured: false,
        readOnly: historical || archived,
        allowedActions: this.computeWorkspaceActions({
          documentType: 'materials',
          historical,
          archived,
          pageCount: materialVersion.pageCount,
          processingState: materialVersion.processingState,
          reviewState: materialVersion.reviewState,
          gradingState: null,
        }),
      };
    }
    const submission = await this.getSubmission(teacherId, documentId);
    const assignment = await this.getAssignment(teacherId, submission.assignmentId);
    const pages = await this.deps.repo.listDocumentPageRows(teacherId, 'submission', documentId);
    const reviewContext = submission.materialsVersionId
      ? await this.deps.repo.findMaterialVersion(teacherId, submission.materialsVersionId)
      : null;
    const archived = assignment.classStatus === 'archived';
    return {
      documentType: 'submission',
      documentId,
      class: { id: assignment.classId, name: assignment.className, status: assignment.classStatus },
      assignment: { id: assignment.id, name: assignment.name, maxScore: assignment.maxScore },
      student: { id: submission.studentId, name: submission.studentName },
      materialVersion: null,
      submission,
      pages: pages.map((row) => this.mapPageSummary(row)),
      processingState: submission.processingState,
      processingCounts: submission.processingCounts,
      reviewState: submission.reviewState,
      gradingState: submission.gradingState,
      documentRevision: submission.documentRevision,
      reviewContext,
      reviewContextCaptured: submission.reviewContextCapturedAt !== null,
      readOnly: archived,
      allowedActions: this.computeWorkspaceActions({
        documentType: 'submission',
        historical: false,
        archived,
        pageCount: submission.pageCount,
        processingState: submission.processingState,
        reviewState: submission.reviewState,
        gradingState: submission.gradingState,
      }),
    };
  }

  /** GET /pages/:pageId (api-routes-review.md §1.2): the canonical editable
   * read for a current, completed page — also valid for a completed page in
   * a historical material version or under archived ancestry (read-only). */
  async getPageWorkspace(teacherId: string, pageId: string): Promise<PageWorkspace> {
    const page = await this.deps.repo.findPage(teacherId, pageId);
    if (!page) throw notFound();
    if (page.processing_state !== 'completed') {
      throw new AssignmentReaderError(409, 'INVALID_STATE', 'This page has not finished processing yet');
    }
    const parentId = this.parentIdOf(page);
    const status = await this.deps.repo.findDocumentStatus(teacherId, page.document_type, parentId);
    if (!status) throw notFound();
    const historical = page.document_type === 'materials' && status.lifecycle === 'historical';
    const archived = status.class_status === 'archived';
    const segmentRows =
      page.document_type === 'submission'
        ? await this.deps.repo.listCurrentQuestionSegments(teacherId, pageId)
        : [];
    return {
      page: this.mapPageSummary(page),
      draft: emptyDraftIfMissing(page.draft),
      questionSegments: segmentRows.map((row) => this.mapQuestionSegment(row)),
      reviewedAt: toIso(page.reviewed_at_ms),
      readOnly: historical || archived,
    };
  }

  /** PATCH /pages/:pageId/draft (api-routes-review.md §1.3). */
  async updatePageDraft(
    teacherId: string,
    pageId: string,
    body: UpdatePageDraftBody,
  ): Promise<PageWorkspace> {
    const page = await this.deps.repo.findPage(teacherId, pageId);
    if (!page) throw notFound();
    const parentId = this.parentIdOf(page);
    const status = await this.deps.repo.findDocumentStatus(teacherId, page.document_type, parentId);
    if (!status) throw notFound();
    if (page.document_type === 'materials' && status.lifecycle === 'historical') {
      throw new AssignmentReaderError(409, 'HISTORICAL_VERSION_READ_ONLY', 'This material version is read-only');
    }
    this.assertActiveAncestry(status.class_status, 'edit a page draft');
    const result = await this.deps.repo.updatePageDraftRow({
      teacherId,
      pageId,
      draft: body.draft,
      expectedContentRevision: body.expectedContentRevision,
    });
    if (result.outcome === 'not_found') throw notFound();
    if (result.outcome === 'invalid_state') {
      throw new AssignmentReaderError(409, 'INVALID_STATE', 'Only a completed page can be edited');
    }
    if (result.outcome === 'conflict') {
      throw new AssignmentReaderError(
        409,
        'REVISION_CONFLICT',
        'This page changed since it was loaded',
        undefined,
        { currentContentRevision: result.currentContentRevision },
      );
    }
    const segmentRows =
      result.page.document_type === 'submission'
        ? await this.deps.repo.listCurrentQuestionSegments(teacherId, pageId)
        : [];
    return {
      page: this.mapPageSummary(result.page),
      draft: emptyDraftIfMissing(result.page.draft),
      questionSegments: segmentRows.map((row) => this.mapQuestionSegment(row)),
      reviewedAt: toIso(result.page.reviewed_at_ms),
      readOnly: false,
    };
  }

  /** POST /pages/:pageId/review (api-routes-review.md §1.4). */
  async reviewPage(teacherId: string, pageId: string, body: ReviewPageBody): Promise<ReviewPageResult> {
    const page = await this.deps.repo.findPage(teacherId, pageId);
    if (!page) throw notFound();
    const parentId = this.parentIdOf(page);
    const status = await this.deps.repo.findDocumentStatus(teacherId, page.document_type, parentId);
    if (!status) throw notFound();
    if (page.document_type === 'materials' && status.lifecycle === 'historical') {
      throw new AssignmentReaderError(409, 'HISTORICAL_VERSION_READ_ONLY', 'This material version is read-only');
    }
    this.assertActiveAncestry(status.class_status, 'review a page');
    const result = await this.deps.repo.reviewPageRow({
      teacherId,
      pageId,
      expectedContentRevision: body.expectedContentRevision,
    });
    if (result.outcome === 'not_found') throw notFound();
    if (result.outcome === 'invalid_state') {
      throw new AssignmentReaderError(409, 'INVALID_STATE', 'This page cannot be reviewed in its current state');
    }
    if (result.outcome === 'conflict') {
      throw new AssignmentReaderError(
        409,
        'REVISION_CONFLICT',
        'This page changed since it was loaded',
        undefined,
        { currentContentRevision: result.currentContentRevision },
      );
    }
    return {
      pageId: result.page.id,
      reviewedContentRevision: result.page.reviewed_content_revision as number,
      reviewedAt: toIso(result.page.reviewed_at_ms) as string,
      documentReviewState: result.documentReviewState,
      allCurrentPagesReviewed: result.allCurrentPagesReviewed,
    };
  }

  private mapDocumentStateResult(
    result: import('./assignment-reader.types').DocumentRevisionCommandOutcome,
    documentType: DocumentType,
    documentId: string,
  ): DocumentStateResult {
    if (result.outcome === 'not_found') throw notFound();
    if (result.outcome === 'invalid_state') {
      throw new AssignmentReaderError(409, 'INVALID_STATE', 'This document cannot change state right now');
    }
    if (result.outcome === 'conflict') {
      throw new AssignmentReaderError(
        409,
        'REVISION_CONFLICT',
        'This document changed since it was loaded',
        undefined,
        { currentDocumentRevision: result.currentDocumentRevision },
      );
    }
    return {
      documentType,
      documentId,
      reviewState: result.reviewState,
      gradingState: result.gradingState,
      documentRevision: result.documentRevision,
      updatedAt: toIso(result.updatedAtMs) as string,
    };
  }

  /** POST /documents/:documentType/:documentId/mark-ready (api-routes-review.md §1.5). */
  async markDocumentReady(
    teacherId: string,
    documentType: DocumentType,
    documentId: string,
    body: DocumentRevisionCommandBody,
  ): Promise<DocumentStateResult> {
    await this.requireNonHistoricalDocumentStatus(teacherId, documentType, documentId);
    const result = await this.deps.repo.markDocumentReadyRow({
      teacherId,
      documentType,
      documentId,
      expectedDocumentRevision: body.expectedDocumentRevision,
    });
    return this.mapDocumentStateResult(result, documentType, documentId);
  }

  /** POST /documents/:documentType/:documentId/return-to-needs-review (api-routes-review.md §1.6). */
  async returnToNeedsReview(
    teacherId: string,
    documentType: DocumentType,
    documentId: string,
    body: DocumentRevisionCommandBody,
  ): Promise<DocumentStateResult> {
    await this.requireNonHistoricalDocumentStatus(teacherId, documentType, documentId);
    const result = await this.deps.repo.returnToNeedsReviewRow({
      teacherId,
      documentType,
      documentId,
      expectedDocumentRevision: body.expectedDocumentRevision,
    });
    return this.mapDocumentStateResult(result, documentType, documentId);
  }

  /** PUT /pages/:pageId/question-segments/:segmentId/judgment
   * (api-routes-review.md §2.1). Question-judgment routes exist only for
   * submissions; a materials page returns 404 rather than creating a
   * parallel grading surface for materials (manifest §2). */
  async updateQuestionJudgment(
    teacherId: string,
    pageId: string,
    segmentId: string,
    body: UpdateQuestionJudgmentBody,
  ): Promise<QuestionJudgment> {
    const page = await this.deps.repo.findPage(teacherId, pageId);
    if (!page || page.document_type !== 'submission' || !page.submission_id) throw notFound();
    const status = await this.deps.repo.findDocumentStatus(teacherId, 'submission', page.submission_id);
    if (!status) throw notFound();
    this.assertActiveAncestry(status.class_status, 'edit a question judgment');
    const result = await this.deps.repo.updateQuestionJudgmentRow({
      teacherId,
      pageId,
      segmentId,
      expectedPageRevision: body.expectedPageRevision,
      judgment: body.judgment,
      awardedPoints: body.awardedPoints,
      comment: body.comment,
    });
    if (result.outcome === 'not_found') throw notFound();
    if (result.outcome === 'invalid_state') {
      throw new AssignmentReaderError(409, 'INVALID_STATE', 'This submission is not open for grading');
    }
    if (result.outcome === 'conflict') {
      throw new AssignmentReaderError(
        409,
        'REVISION_CONFLICT',
        'This page changed since it was loaded',
        undefined,
        { currentPageRevision: result.currentPageRevision },
      );
    }
    return {
      segmentId: result.segmentId,
      judgment: result.judgment,
      awardedPoints: toNumber(result.awardedPoints),
      comment: result.comment,
      updatedAt: toIso(result.updatedAtMs),
    };
  }

  private async buildGradingDraft(teacherId: string, row: GradingDraftRow): Promise<GradingDraft> {
    const segments = await this.deps.repo.listSubmissionQuestionSegments(teacherId, row.submission_id);
    return {
      submissionId: row.submission_id,
      documentRevision: row.document_revision,
      score: toNumber(row.score),
      comments: row.comments,
      questionJudgments: segments.map((segment) => ({
        segmentId: segment.id,
        judgment: segment.judgment ?? 'unmarked',
        awardedPoints: toNumber(segment.awarded_points),
        comment: segment.comment,
        updatedAt: toIso(segment.judgment_updated_at_ms),
      })),
      gradingState: row.grading_state,
      gradedAt: toIso(row.graded_at_ms),
      updatedAt: toIso(row.updated_at_ms) as string,
    };
  }

  /** PATCH /submissions/:submissionId/grading (api-routes-review.md §2.2). */
  async updateGradingDraft(
    teacherId: string,
    submissionId: string,
    body: UpdateGradingDraftBody,
  ): Promise<GradingDraft> {
    const submission = await this.getSubmission(teacherId, submissionId);
    const assignment = await this.getAssignment(teacherId, submission.assignmentId);
    this.assertActiveAncestry(assignment.classStatus, 'edit grading');
    if (
      body.score !== undefined &&
      body.score !== null &&
      assignment.maxScore !== null &&
      body.score > assignment.maxScore
    ) {
      throw new AssignmentReaderError(409, 'SCORE_EXCEEDS_MAXIMUM', 'Score exceeds the assignment maximum');
    }
    const result = await this.deps.repo.updateGradingDraftRow({
      teacherId,
      submissionId,
      expectedDocumentRevision: body.expectedDocumentRevision,
      scoreProvided: body.score !== undefined,
      score: body.score ?? null,
      commentsProvided: body.comments !== undefined,
      comments: body.comments ?? null,
    });
    if (result.outcome === 'not_found') throw notFound();
    if (result.outcome === 'invalid_state') {
      throw new AssignmentReaderError(409, 'INVALID_STATE', 'This submission is not open for grading');
    }
    if (result.outcome === 'conflict') {
      throw new AssignmentReaderError(
        409,
        'REVISION_CONFLICT',
        'This submission changed since it was loaded',
        undefined,
        { currentDocumentRevision: result.currentDocumentRevision },
      );
    }
    return this.buildGradingDraft(teacherId, result.row);
  }

  /** GET /submissions/:submissionId/question-points-total (api-routes-review.md §2.3). */
  async getQuestionPointsTotal(
    teacherId: string,
    submissionId: string,
    query: QuestionPointsTotalQuery,
  ): Promise<QuestionPointsTotal> {
    await this.getSubmission(teacherId, submissionId);
    const row = await this.deps.repo.getQuestionPointsTotalRow(teacherId, submissionId);
    if (!row) throw notFound();
    if (row.documentRevision !== query.expectedDocumentRevision) {
      throw new AssignmentReaderError(
        409,
        'REVISION_CONFLICT',
        'This submission changed since it was loaded',
        undefined,
        { currentDocumentRevision: row.documentRevision },
      );
    }
    const segments = row.segments.map((segment) => ({
      id: segment.id,
      ordinal: segment.ordinal,
      label: segment.label,
      questionText: segment.questionText,
      awardedPoints: toNumber(segment.awardedPoints),
    }));
    const total = roundTo2(
      segments.reduce((sum, segment) => sum + (segment.awardedPoints ?? 0), 0),
    );
    return {
      submissionId,
      documentRevision: row.documentRevision,
      total,
      segmentsWithPoints: segments.filter((segment) => segment.awardedPoints !== null).length,
      totalSegments: segments.length,
      segments,
    };
  }

  /** POST /submissions/:submissionId/apply-question-points-to-score (api-routes-review.md §2.4). */
  async applyQuestionPointsToScore(
    teacherId: string,
    submissionId: string,
    body: ApplyQuestionPointsBody,
  ): Promise<GradingDraft> {
    const submission = await this.getSubmission(teacherId, submissionId);
    const assignment = await this.getAssignment(teacherId, submission.assignmentId);
    this.assertActiveAncestry(assignment.classStatus, 'apply question points to score');
    const result = await this.deps.repo.applyQuestionPointsToScoreRow({
      teacherId,
      submissionId,
      expectedDocumentRevision: body.expectedDocumentRevision,
      expectedTotal: body.expectedTotal,
    });
    if (result.outcome === 'not_found') throw notFound();
    if (result.outcome === 'invalid_state') {
      throw new AssignmentReaderError(409, 'INVALID_STATE', 'This submission is not open for grading');
    }
    if (result.outcome === 'conflict') {
      throw new AssignmentReaderError(
        409,
        'REVISION_CONFLICT',
        'This submission changed since it was loaded',
        undefined,
        { currentDocumentRevision: result.currentDocumentRevision },
      );
    }
    if (result.outcome === 'total_conflict') {
      throw new AssignmentReaderError(
        409,
        'REVISION_CONFLICT',
        'The question-points total changed since it was loaded',
        undefined,
        { currentQuestionPointsTotal: roundTo2(result.currentTotal) },
      );
    }
    if (result.outcome === 'score_exceeds_maximum') {
      throw new AssignmentReaderError(
        409,
        'SCORE_EXCEEDS_MAXIMUM',
        'The question-points total exceeds the assignment maximum',
      );
    }
    return this.buildGradingDraft(teacherId, result.row);
  }

  /** POST /submissions/:submissionId/mark-graded (api-routes-review.md §2.5). */
  async markSubmissionGraded(
    teacherId: string,
    submissionId: string,
    body: DocumentRevisionCommandBody,
  ): Promise<GradingDraft> {
    const submission = await this.getSubmission(teacherId, submissionId);
    const assignment = await this.getAssignment(teacherId, submission.assignmentId);
    this.assertActiveAncestry(assignment.classStatus, 'mark a submission graded');
    const result = await this.deps.repo.markSubmissionGradedRow({
      teacherId,
      submissionId,
      expectedDocumentRevision: body.expectedDocumentRevision,
    });
    if (result.outcome === 'not_found') throw notFound();
    if (result.outcome === 'invalid_state') {
      throw new AssignmentReaderError(409, 'INVALID_STATE', 'This submission is not ready to grade');
    }
    if (result.outcome === 'conflict') {
      throw new AssignmentReaderError(
        409,
        'REVISION_CONFLICT',
        'This submission changed since it was loaded',
        undefined,
        { currentDocumentRevision: result.currentDocumentRevision },
      );
    }
    return this.buildGradingDraft(teacherId, result.row);
  }

  // ——— Deletion (TASK-018) ————————————————————————————————————————————————————

  private toDeletionOperation(row: DeletionOperationRow): DeletionOperation {
    return {
      id: row.id,
      targetType: row.target_type as DeletionTargetType,
      targetId: row.target_id,
      status: 'pending',
      acceptedAt: toIso(row.accepted_at_ms) as string,
    };
  }

  private async enqueueDeletion(operationId: string, targetType: DeletionTargetType): Promise<void> {
    try {
      await this.requireQueues().sendDeletionOperation({
        kind: 'deletion_operation',
        operationId,
        targetType,
      });
    } catch (error) {
      // The operation row is already committed; internal cleanup replay or
      // operator DLQ recovery finishes delivery (manifest §1.1/§3.1).
      console.error('deletion: cleanup queue send failed', { operationId, targetType, error });
    }
  }

  /** DELETE /assignments/:assignmentId/materials (api-routes-documents.md
   * §1.4). Deletes the draft, current, and every historical material
   * version of this assignment in one operation; submissions are untouched. */
  async deleteMaterials(
    teacherId: string,
    assignmentId: string,
  ): Promise<{ operation: DeletionOperation; created: boolean }> {
    const pending = await this.deps.repo.findPendingDeletionOperation(teacherId, 'materials', assignmentId);
    if (pending) return { operation: this.toDeletionOperation(pending), created: false };
    await this.getAssignment(teacherId, assignmentId);
    const storageKeys = await this.deps.repo.listStorageKeysForMaterialsScope(teacherId, assignmentId);
    const operation = await this.deps.repo.createDeletionOperation({
      teacherId,
      targetType: 'materials',
      targetId: assignmentId,
      storageKeys,
    });
    await this.enqueueDeletion(operation.id, 'materials');
    return { operation: this.toDeletionOperation(operation), created: true };
  }

  /** DELETE /submissions/:submissionId (api-routes-documents.md §1.9). */
  async deleteSubmission(
    teacherId: string,
    submissionId: string,
  ): Promise<{ operation: DeletionOperation; created: boolean }> {
    const pending = await this.deps.repo.findPendingDeletionOperation(teacherId, 'submission', submissionId);
    if (pending) return { operation: this.toDeletionOperation(pending), created: false };
    await this.getSubmission(teacherId, submissionId);
    const storageKeys = await this.deps.repo.listStorageKeysForSubmissionScope(teacherId, submissionId);
    const operation = await this.deps.repo.createDeletionOperation({
      teacherId,
      targetType: 'submission',
      targetId: submissionId,
      storageKeys,
    });
    await this.enqueueDeletion(operation.id, 'submission');
    return { operation: this.toDeletionOperation(operation), created: true };
  }

  /** DELETE /classes/:classId/students/:studentId/data (api-routes-hierarchy.md §1.10). */
  async deleteStudentData(
    teacherId: string,
    classId: string,
    studentId: string,
  ): Promise<{ operation: DeletionOperation; created: boolean }> {
    const pending = await this.deps.repo.findPendingDeletionOperation(teacherId, 'student_data', studentId);
    if (pending) return { operation: this.toDeletionOperation(pending), created: false };
    await this.getClass(teacherId, classId);
    await this.assertStudentInClass(teacherId, classId, studentId);
    const storageKeys = await this.deps.repo.listStorageKeysForStudentDataScope(teacherId, studentId);
    const operation = await this.deps.repo.createDeletionOperation({
      teacherId,
      targetType: 'student_data',
      targetId: studentId,
      storageKeys,
    });
    await this.enqueueDeletion(operation.id, 'student_data');
    return { operation: this.toDeletionOperation(operation), created: true };
  }

  /** DELETE /assignments/:assignmentId (api-routes-hierarchy.md §2.5). */
  async deleteAssignment(
    teacherId: string,
    assignmentId: string,
  ): Promise<{ operation: DeletionOperation; created: boolean }> {
    const pending = await this.deps.repo.findPendingDeletionOperation(teacherId, 'assignment', assignmentId);
    if (pending) return { operation: this.toDeletionOperation(pending), created: false };
    await this.getAssignment(teacherId, assignmentId);
    const storageKeys = await this.deps.repo.listStorageKeysForAssignmentScope(teacherId, assignmentId);
    const operation = await this.deps.repo.createDeletionOperation({
      teacherId,
      targetType: 'assignment',
      targetId: assignmentId,
      storageKeys,
    });
    await this.enqueueDeletion(operation.id, 'assignment');
    return { operation: this.toDeletionOperation(operation), created: true };
  }

  /** DELETE /classes/:classId (api-routes-hierarchy.md §1.5). */
  async deleteClass(
    teacherId: string,
    classId: string,
  ): Promise<{ operation: DeletionOperation; created: boolean }> {
    const pending = await this.deps.repo.findPendingDeletionOperation(teacherId, 'class', classId);
    if (pending) return { operation: this.toDeletionOperation(pending), created: false };
    await this.getClass(teacherId, classId);
    const storageKeys = await this.deps.repo.listStorageKeysForClassScope(teacherId, classId);
    const operation = await this.deps.repo.createDeletionOperation({
      teacherId,
      targetType: 'class',
      targetId: classId,
      storageKeys,
    });
    await this.enqueueDeletion(operation.id, 'class');
    return { operation: this.toDeletionOperation(operation), created: true };
  }

  /** DELETE /user/account (api-routes-review.md §3.1), called after the
   * caller has already soft-disabled access and revoked sessions. Enumerates
   * and schedules every Assignment Reader relational/R2 key the teacher
   * owns; not teacher-replayable once the session is revoked (401 instead). */
  async scheduleAccountDeletion(
    teacherId: string,
  ): Promise<{ operation: DeletionOperation; created: boolean }> {
    const pending = await this.deps.repo.findPendingDeletionOperation(teacherId, 'account', teacherId);
    if (pending) return { operation: this.toDeletionOperation(pending), created: false };
    const storageKeys = await this.deps.repo.listStorageKeysForAccountScope(teacherId);
    const operation = await this.deps.repo.createDeletionOperation({
      teacherId,
      targetType: 'account',
      targetId: teacherId,
      storageKeys,
    });
    await this.enqueueDeletion(operation.id, 'account');
    return { operation: this.toDeletionOperation(operation), created: true };
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

const toNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

/** Guards against float drift in a summed `numeric(6,2)` total (REQ-018). */
const roundTo2 = (value: number): number => Math.round(value * 100) / 100;

const EMPTY_DRAFT: AssignmentDraft = {
  schemaVersion: 1,
  doc: { type: 'doc', content: [] },
};

/** A completed page always has a draft (`pages_completed_has_content`), but
 * the column type stays `unknown` at the repository boundary; this trusts
 * that DB invariant rather than re-validating the draft shape on every read. */
const emptyDraftIfMissing = (draft: unknown): AssignmentDraft =>
  (draft ?? EMPTY_DRAFT) as AssignmentDraft;


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
