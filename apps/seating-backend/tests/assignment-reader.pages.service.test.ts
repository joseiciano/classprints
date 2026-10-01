import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AssignmentReaderService,
  type AssignmentReaderQueues,
} from '../src/assignment-reader/assignment-reader.service';
import type { AssignmentReaderRepository } from '../src/assignment-reader/assignment-reader.repository';
import type {
  DocumentStatusRow,
  PageRow,
  DeletionOperationRow,
} from '../src/assignment-reader/assignment-reader.types';
import type { PageImageRepository, ImageByteStream } from '../src/assignment-reader/page-image.repository';
import {
  UnsupportedImageError,
  MAX_UPLOAD_BYTES,
  regionToPixelBox,
  sniffImageSignature,
} from '../src/assignment-reader/page-image.repository';
import type { TranscriptionPageMessage, DeletionOperationMessage } from '@classprints/assignment-reader-shared';

/**
 * TASK-010/TASK-011/TASK-012 service tests. A compact in-memory fake stands
 * in for Postgres and the R2/Images/queue bindings so these exercise the
 * orchestration this ticket adds: the 20-page boundary, blob/row
 * compensation, confirm's set-equality and revision rules, retry-confirm's
 * eligibility gate, replace's page-state branching, remove's materials
 * lifecycle gate, and authenticated image delivery.
 */

const TEACHER_A = '11111111-1111-1111-1111-111111111111';
const TEACHER_B = '22222222-2222-2222-2222-222222222222';
const MATERIALS_DRAFT = 'aaaaaaaa-0000-4000-8000-000000000001';
const MATERIALS_CURRENT = 'aaaaaaaa-0000-4000-8000-000000000002';
const MATERIALS_HISTORICAL = 'aaaaaaaa-0000-4000-8000-000000000003';
const SUBMISSION_1 = 'bbbbbbbb-0000-4000-8000-000000000001';
const CLASS_1 = 'cccccccc-0000-4000-8000-000000000001';
const ASSIGNMENT_1 = 'dddddddd-0000-4000-8000-000000000001';

const notImplemented = (name: string) => () => {
  throw new Error(`fake repository: ${name} is not used by these tests`);
};

interface FakeState {
  docs: Map<string, DocumentStatusRow>;
  pages: Map<string, PageRow>;
  deletionOps: DeletionOperationRow[];
  nextPosition: Map<string, number>;
  /** Submission IDs that currently have a judgment on a current segment
   * (TASK-015 §3.4 consent gate); materials never enter this set. */
  submissionsWithJudgments: Set<string>;
}

const newPageRow = (overrides: Partial<PageRow> & { id: string }): PageRow => ({
  document_type: 'materials',
  materials_version_id: null,
  submission_id: null,
  student_id: null,
  class_id: CLASS_1,
  assignment_id: ASSIGNMENT_1,
  teacher_id: TEACHER_A,
  position: 1,
  label: 'Materials · Page 1',
  storage_key: `teacher/${TEACHER_A}/class/${CLASS_1}/assignment/${ASSIGNMENT_1}/materials/${overrides.id}.jpg`,
  processing_state: 'uploading',
  attempt_count: 0,
  page_revision: 1,
  content_revision: 0,
  reviewed_content_revision: null,
  reviewed_at_ms: null,
  edited_by_teacher: false,
  teacher_edit_count: 0,
  draft: null,
  failure_code: null,
  failure_message: null,
  queued_at_ms: null,
  started_at_ms: null,
  completed_at_ms: null,
  uploaded_at_ms: Date.now(),
  created_at_ms: Date.now(),
  updated_at_ms: Date.now(),
  ...overrides,
});

const freshState = (): FakeState => {
  const docs = new Map<string, DocumentStatusRow>();
  docs.set(MATERIALS_DRAFT, {
    document_type: 'materials',
    document_id: MATERIALS_DRAFT,
    document_revision: 1,
    draft_confirmed: false,
    class_id: CLASS_1,
    assignment_id: ASSIGNMENT_1,
    student_id: null,
    class_status: 'active',
    student_name: null,
    lifecycle: 'draft',
  });
  docs.set(MATERIALS_CURRENT, {
    document_type: 'materials',
    document_id: MATERIALS_CURRENT,
    document_revision: 2,
    draft_confirmed: true,
    class_id: CLASS_1,
    assignment_id: ASSIGNMENT_1,
    student_id: null,
    class_status: 'active',
    student_name: null,
    lifecycle: 'current',
  });
  docs.set(MATERIALS_HISTORICAL, {
    document_type: 'materials',
    document_id: MATERIALS_HISTORICAL,
    document_revision: 2,
    draft_confirmed: true,
    class_id: CLASS_1,
    assignment_id: ASSIGNMENT_1,
    student_id: null,
    class_status: 'active',
    student_name: null,
    lifecycle: 'historical',
  });
  docs.set(SUBMISSION_1, {
    document_type: 'submission',
    document_id: SUBMISSION_1,
    document_revision: 1,
    draft_confirmed: false,
    class_id: CLASS_1,
    assignment_id: ASSIGNMENT_1,
    student_id: 'student-1',
    class_status: 'active',
    student_name: 'Maya Rodriguez',
    lifecycle: null,
  });
  return {
    docs,
    pages: new Map(),
    deletionOps: [],
    nextPosition: new Map(),
    submissionsWithJudgments: new Set(),
  };
};

const buildFakeRepository = (state: FakeState): AssignmentReaderRepository => {
  const parentKeyOf = (documentType: 'materials' | 'submission', documentId: string) =>
    `${documentType}:${documentId}`;
  const pagesFor = (documentType: 'materials' | 'submission', documentId: string): PageRow[] =>
    [...state.pages.values()]
      .filter((page) =>
        documentType === 'materials'
          ? page.materials_version_id === documentId
          : page.submission_id === documentId,
      )
      .sort((a, b) => a.position - b.position);

  return {
    listClasses: notImplemented('listClasses'),
    findClass: notImplemented('findClass'),
    createClass: notImplemented('createClass'),
    updateClass: notImplemented('updateClass'),
    listStudents: notImplemented('listStudents'),
    findStudent: notImplemented('findStudent'),
    createStudent: notImplemented('createStudent'),
    updateStudent: notImplemented('updateStudent'),
    removeStudent: notImplemented('removeStudent'),
    listAssignments: notImplemented('listAssignments'),
    findAssignment: notImplemented('findAssignment'),
    createAssignment: notImplemented('createAssignment'),
    updateAssignment: notImplemented('updateAssignment'),
    countSubmissionsAboveScore: notImplemented('countSubmissionsAboveScore'),
    refreshAssignmentStatus: notImplemented('refreshAssignmentStatus'),
    listMaterialVersions: notImplemented('listMaterialVersions'),
    findMaterialVersion: notImplemented('findMaterialVersion'),
    findCurrentMaterialVersion: notImplemented('findCurrentMaterialVersion'),
    createDraftMaterialVersion: notImplemented('createDraftMaterialVersion'),
    findDraftMaterialVersion: notImplemented('findDraftMaterialVersion'),
    listProcessing: notImplemented('listProcessing'),
    listSubmissions: notImplemented('listSubmissions'),
    findSubmission: notImplemented('findSubmission'),
    createSubmission: notImplemented('createSubmission'),
    listSavedSeatingCharts: notImplemented('listSavedSeatingCharts'),
    findSavedSeatingChart: notImplemented('findSavedSeatingChart'),
    findSavedSeatingChartByJob: notImplemented('findSavedSeatingChartByJob'),
    saveSeatingChart: notImplemented('saveSeatingChart'),
    findSeatingJobByExternalId: notImplemented('findSeatingJobByExternalId'),
    findSeatingResult: notImplemented('findSeatingResult'),

    async promoteDraftMaterials(teacherId, materialVersionId) {
      const doc = state.docs.get(materialVersionId);
      if (doc) {
        state.docs.set(materialVersionId, { ...doc, lifecycle: 'current', draft_confirmed: true });
      }
    },

    async findDocumentStatus(teacherId, documentType, documentId) {
      const doc = state.docs.get(documentId);
      if (!doc || doc.document_type !== documentType) return null;
      // Every fixture document belongs to TEACHER_A; cross-owner is 404.
      return teacherId === TEACHER_A ? doc : null;
    },

    async findPage(teacherId, pageId) {
      const page = state.pages.get(pageId);
      if (!page || page.teacher_id !== teacherId) return null;
      return page;
    },

    async listDocumentPageRows(teacherId, documentType, documentId) {
      return pagesFor(documentType, documentId);
    },

    async countDocumentPages(teacherId, documentType, documentId) {
      return pagesFor(documentType, documentId).length;
    },

    async insertPageRow(input) {
      const key = parentKeyOf(input.documentType, (input.materialsVersionId ?? input.submissionId)!);
      const current = pagesFor(input.documentType, (input.materialsVersionId ?? input.submissionId)!);
      if (current.length >= 20) return null;
      const position = current.length + 1;
      state.nextPosition.set(key, position + 1);
      const row = newPageRow({
        id: input.id,
        document_type: input.documentType,
        materials_version_id: input.materialsVersionId,
        submission_id: input.submissionId,
        student_id: input.studentId,
        class_id: input.classId,
        assignment_id: input.assignmentId,
        teacher_id: input.teacherId,
        position,
        label: `${input.ownerLabel} · Page ${position}`,
        storage_key: input.storageKey,
        processing_state: 'uploading',
      });
      state.pages.set(row.id, row);
      if (input.documentType === 'submission') {
        const doc = state.docs.get(input.submissionId!);
        if (doc) {
          state.docs.set(input.submissionId!, { ...doc, draft_confirmed: false });
        }
      }
      return row;
    },

    async confirmDocumentOrder({ teacherId, documentType, documentId, orderedPageIds, orderChanged }) {
      orderedPageIds.forEach((id, index) => {
        const page = state.pages.get(id);
        if (page) state.pages.set(id, { ...page, position: index + 1 });
      });
      const queuedSeeds: Array<{ pageId: string; pageRevision: number }> = [];
      for (const id of orderedPageIds) {
        const page = state.pages.get(id);
        if (page && page.processing_state === 'uploading') {
          state.pages.set(id, { ...page, processing_state: 'queued', queued_at_ms: Date.now() });
          queuedSeeds.push({ pageId: id, pageRevision: page.page_revision });
        }
      }
      const doc = state.docs.get(documentId)!;
      const documentRevision = doc.document_revision + (orderChanged ? 1 : 0);
      state.docs.set(documentId, { ...doc, document_revision: documentRevision, draft_confirmed: true });
      return { documentRevision, pages: pagesFor(documentType, documentId), queuedSeeds };
    },

    async listQueuedUndeliveredPages(teacherId, documentType, documentId) {
      return pagesFor(documentType, documentId).filter(
        (page) => page.processing_state === 'queued' && page.attempt_count === 0,
      );
    },

    async replacePageRow(input) {
      const old = state.pages.get(input.replacedPageId);
      if (!old) throw new Error('Replaced page not found');
      state.pages.delete(input.replacedPageId);
      const row = newPageRow({
        id: input.id,
        document_type: input.documentType,
        materials_version_id: input.materialsVersionId,
        submission_id: input.submissionId,
        student_id: input.studentId,
        class_id: input.classId,
        assignment_id: input.assignmentId,
        teacher_id: input.teacherId,
        position: input.position,
        label: input.label,
        storage_key: input.storageKey,
        processing_state: input.requeueImmediately ? 'queued' : 'uploading',
        page_revision: input.pageRevision,
        queued_at_ms: input.requeueImmediately ? Date.now() : null,
      });
      state.pages.set(row.id, row);
      const parentId = (input.materialsVersionId ?? input.submissionId)!;
      const doc = state.docs.get(parentId)!;
      const documentRevision = doc.document_revision + 1;
      state.docs.set(parentId, {
        ...doc,
        document_revision: documentRevision,
        // Mirrors assignment-reader.repository.ts's replacePageRow: a
        // `failed`-page recovery (requeueImmediately=true) preserves
        // whatever draft_confirmed already was rather than forcing it true,
        // because a newer sibling page can have reset it to false; an
        // `uploading`-page recovery (requeueImmediately=false) always forces
        // it false, matching the already-unconfirmed state that implies.
        draft_confirmed: input.documentType === 'submission' ? doc.draft_confirmed && input.requeueImmediately : doc.draft_confirmed,
      });
      return { page: row, documentRevision, replacedStorageKey: old.storage_key };
    },

    async removePageRow(teacherId, pageId) {
      const page = state.pages.get(pageId);
      if (!page || page.teacher_id !== teacherId) return null;
      state.pages.delete(pageId);
      const parentId = (page.materials_version_id ?? page.submission_id)!;
      for (const sibling of pagesFor(page.document_type, parentId)) {
        if (sibling.position > page.position) {
          state.pages.set(sibling.id, { ...sibling, position: sibling.position - 1 });
        }
      }
      const doc = state.docs.get(parentId)!;
      const documentRevision = doc.document_revision + 1;
      state.docs.set(parentId, { ...doc, document_revision: documentRevision, draft_confirmed: false });
      return { documentRevision, removedStorageKey: page.storage_key };
    },

    async findPageImageSource(teacherId, pageId) {
      const page = state.pages.get(pageId);
      if (!page || page.teacher_id !== teacherId) return null;
      return {
        id: page.id,
        storage_key: page.storage_key,
        teacher_id: page.teacher_id,
        class_id: page.class_id,
        assignment_id: page.assignment_id,
        document_type: page.document_type,
      };
    },

    async createDeletionOperation({ teacherId, targetType, targetId }) {
      const operation: DeletionOperationRow = {
        id: `op-${state.deletionOps.length + 1}`,
        target_type: targetType,
        target_id: targetId,
        status: 'pending',
        accepted_at_ms: Date.now(),
      };
      state.deletionOps.push(operation);
      return operation;
    },

    async findPendingDeletionOperation(teacherId, targetType, targetId) {
      return (
        state.deletionOps.find(
          (op) => op.target_type === targetType && op.target_id === targetId && op.status === 'pending',
        ) ?? null
      );
    },

    async retryPageRow(teacherId, pageId) {
      const page = state.pages.get(pageId);
      if (!page || page.teacher_id !== teacherId || page.processing_state !== 'failed') return null;
      const now = Date.now();
      const updated: PageRow = {
        ...page,
        page_revision: page.page_revision + 1,
        processing_state: 'queued',
        attempt_count: 0,
        failure_code: null,
        failure_message: null,
        draft: null,
        started_at_ms: null,
        completed_at_ms: null,
        queued_at_ms: now,
        updated_at_ms: now,
      };
      state.pages.set(pageId, updated);
      const parentId = (page.materials_version_id ?? page.submission_id)!;
      const doc = state.docs.get(parentId)!;
      const documentRevision = doc.document_revision + 1;
      state.docs.set(parentId, { ...doc, document_revision: documentRevision });
      return { page: updated, documentRevision };
    },

    async retranscribeDocumentRows({ teacherId, documentType, documentId, expectedDocumentRevision }) {
      const doc = state.docs.get(documentId);
      if (!doc || doc.document_revision !== expectedDocumentRevision) return null;
      const documentRevision = doc.document_revision + 1;
      state.docs.set(documentId, { ...doc, document_revision: documentRevision });
      const now = Date.now();
      const pages = pagesFor(documentType, documentId)
        .filter((page) => page.processing_state === 'completed')
        .map((page) => {
          const updated: PageRow = {
            ...page,
            page_revision: page.page_revision + 1,
            processing_state: 'queued',
            attempt_count: 0,
            failure_code: null,
            failure_message: null,
            draft: null,
            started_at_ms: null,
            completed_at_ms: null,
            queued_at_ms: now,
            updated_at_ms: now,
          };
          state.pages.set(page.id, updated);
          return updated;
        });
      return { documentRevision, pages };
    },

    async hasCurrentQuestionJudgments(teacherId, submissionId) {
      return state.submissionsWithJudgments.has(submissionId);
    },
  };
};

interface FakeImagesOptions {
  rejectUnsupported?: boolean;
}

const buildFakeImages = (options: FakeImagesOptions = {}): PageImageRepository & { deleted: string[] } => {
  const deleted: string[] = [];
  return {
    deleted,
    async storeNormalizedImage({ storageKey }) {
      if (options.rejectUnsupported) {
        throw new UnsupportedImageError('not a supported image');
      }
      void storageKey;
    },
    async deleteObject(storageKey) {
      deleted.push(storageKey);
    },
    async renderVariant({ storageKey, variant, rotation }) {
      if (storageKey === 'missing') return null;
      return {
        // Minimal stand-in stream; not exercised by these tests' assertions.
        body: new ReadableStream() as unknown as ImageByteStream,
        contentType: `image/jpeg;variant=${variant};rotation=${rotation}`,
      };
    },
  };
};

interface FakeQueues extends AssignmentReaderQueues {
  transcriptionSent: TranscriptionPageMessage[];
  deletionSent: DeletionOperationMessage[];
  failTranscription: boolean;
  failDeletion: boolean;
}

const buildFakeQueues = (): FakeQueues => ({
  transcriptionSent: [],
  deletionSent: [],
  failTranscription: false,
  failDeletion: false,
  async sendTranscriptionPage(message) {
    if (this.failTranscription) throw new Error('queue unavailable');
    this.transcriptionSent.push(message);
  },
  async sendDeletionOperation(message) {
    if (this.failDeletion) throw new Error('queue unavailable');
    this.deletionSent.push(message);
  },
});

const buildService = (state: FakeState, images = buildFakeImages(), queues = buildFakeQueues()) =>
  new AssignmentReaderService({ repo: buildFakeRepository(state), images, queues });

describe('AssignmentReaderService — page upload (TASK-010)', () => {
  it('appends a page with an atomically assigned position and label', async () => {
    const state = freshState();
    const service = buildService(state);
    const page = await service.uploadPage(TEACHER_A, 'materials', MATERIALS_DRAFT, new ArrayBuffer(10));
    expect(page.position).toBe(1);
    expect(page.label).toBe('Materials · Page 1');
    expect(page.processingState).toBe('uploading');

    const second = await service.uploadPage(TEACHER_A, 'materials', MATERIALS_DRAFT, new ArrayBuffer(10));
    expect(second.position).toBe(2);
  });

  it('rejects an upload to a non-draft (current) materials version', async () => {
    const state = freshState();
    const service = buildService(state);
    await expect(
      service.uploadPage(TEACHER_A, 'materials', MATERIALS_CURRENT, new ArrayBuffer(10)),
    ).rejects.toMatchObject({ code: 'HISTORICAL_VERSION_READ_ONLY', status: 409 });
  });

  it('rejects a file over the 10 MB limit without touching storage', async () => {
    const state = freshState();
    const images = buildFakeImages();
    const service = buildService(state, images);
    await expect(
      service.uploadPage(TEACHER_A, 'materials', MATERIALS_DRAFT, new ArrayBuffer(MAX_UPLOAD_BYTES + 1)),
    ).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE', status: 413 });
    expect(images.deleted).toHaveLength(0);
  });

  it('maps an unsupported/malformed image to 415 UNSUPPORTED_IMAGE', async () => {
    const state = freshState();
    const images = buildFakeImages({ rejectUnsupported: true });
    const service = buildService(state, images);
    await expect(
      service.uploadPage(TEACHER_A, 'materials', MATERIALS_DRAFT, new ArrayBuffer(10)),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_IMAGE', status: 415 });
  });

  it('deletes the just-written R2 object when the 20-page boundary is hit', async () => {
    const state = freshState();
    for (let i = 0; i < 20; i += 1) {
      const id = `page-${i}`;
      state.pages.set(
        id,
        newPageRow({ id, materials_version_id: MATERIALS_DRAFT, position: i + 1 }),
      );
    }
    const images = buildFakeImages();
    const service = buildService(state, images);
    await expect(
      service.uploadPage(TEACHER_A, 'materials', MATERIALS_DRAFT, new ArrayBuffer(10)),
    ).rejects.toMatchObject({ code: 'PAGE_LIMIT_EXCEEDED', status: 409 });
    expect(images.deleted).toHaveLength(1);
  });

  it('rejects a cross-owner upload as 404, not 403', async () => {
    const state = freshState();
    const service = buildService(state);
    await expect(
      service.uploadPage(TEACHER_B, 'materials', MATERIALS_DRAFT, new ArrayBuffer(10)),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
  });
});

describe('AssignmentReaderService — confirm / retry-confirm (TASK-011)', () => {
  const seedTwoUploadingPages = (state: FakeState) => {
    state.pages.set('p1', newPageRow({ id: 'p1', materials_version_id: MATERIALS_DRAFT, position: 1 }));
    state.pages.set('p2', newPageRow({ id: 'p2', materials_version_id: MATERIALS_DRAFT, position: 2 }));
  };

  it('confirms, queues uploading pages, and sends one message per queued page', async () => {
    const state = freshState();
    seedTwoUploadingPages(state);
    const queues = buildFakeQueues();
    const service = buildService(state, buildFakeImages(), queues);
    const result = await service.confirmDocument(TEACHER_A, 'materials', MATERIALS_DRAFT, ['p1', 'p2']);
    expect(result.pages.every((p) => p.processingState === 'queued')).toBe(true);
    expect(queues.transcriptionSent).toHaveLength(2);
    expect(state.docs.get(MATERIALS_DRAFT)?.lifecycle).toBe('current');
  });

  it('rejects duplicate page IDs', async () => {
    const state = freshState();
    seedTwoUploadingPages(state);
    const service = buildService(state);
    await expect(
      service.confirmDocument(TEACHER_A, 'materials', MATERIALS_DRAFT, ['p1', 'p1']),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST', status: 400 });
  });

  it('rejects a page set that does not match the current pages exactly', async () => {
    const state = freshState();
    seedTwoUploadingPages(state);
    const service = buildService(state);
    await expect(
      service.confirmDocument(TEACHER_A, 'materials', MATERIALS_DRAFT, ['p1']),
    ).rejects.toMatchObject({ code: 'INVALID_STATE', status: 409 });
  });

  it('rejects confirming an already-confirmed document', async () => {
    const state = freshState();
    seedTwoUploadingPages(state);
    const service = buildService(state);
    state.docs.set(MATERIALS_DRAFT, { ...state.docs.get(MATERIALS_DRAFT)!, draft_confirmed: true });
    await expect(
      service.confirmDocument(TEACHER_A, 'materials', MATERIALS_DRAFT, ['p1', 'p2']),
    ).rejects.toMatchObject({ code: 'INVALID_STATE', status: 409 });
  });

  it('surfaces a 500 QUEUE_DELIVERY_FAILED when transcription delivery fails, keeping the commit', async () => {
    const state = freshState();
    seedTwoUploadingPages(state);
    const queues = buildFakeQueues();
    queues.failTranscription = true;
    const service = buildService(state, buildFakeImages(), queues);
    await expect(
      service.confirmDocument(TEACHER_A, 'materials', MATERIALS_DRAFT, ['p1', 'p2']),
    ).rejects.toMatchObject({ code: 'QUEUE_DELIVERY_FAILED', status: 500 });
    // The DB side already committed: both pages are queued despite the
    // thrown response.
    expect(state.pages.get('p1')?.processing_state).toBe('queued');
  });

  it('retry-confirm resends only queued pages with no accepted attempt', async () => {
    const state = freshState();
    seedTwoUploadingPages(state);
    await buildService(state).confirmDocument(TEACHER_A, 'materials', MATERIALS_DRAFT, ['p1', 'p2']);
    // Simulate one page's execution already being accepted.
    const p1 = state.pages.get('p1')!;
    state.pages.set('p1', { ...p1, attempt_count: 1, processing_state: 'transcribing' });

    const queues = buildFakeQueues();
    const service = buildService(state, buildFakeImages(), queues);
    await service.retryConfirmDocument(TEACHER_A, 'materials', MATERIALS_DRAFT);
    expect(queues.transcriptionSent).toHaveLength(1);
    expect(queues.transcriptionSent[0].pageId).toBe('p2');
    expect(queues.transcriptionSent[0].isRetry).toBe(true);
  });

  it('retry-confirm returns 409 INVALID_STATE when nothing is eligible', async () => {
    const state = freshState();
    const service = buildService(state);
    await expect(
      service.retryConfirmDocument(TEACHER_A, 'materials', MATERIALS_DRAFT),
    ).rejects.toMatchObject({ code: 'INVALID_STATE', status: 409 });
  });

  it('retry-confirm is allowed on a current (already-promoted) materials version', async () => {
    const state = freshState();
    state.pages.set(
      'p3',
      newPageRow({
        id: 'p3',
        materials_version_id: MATERIALS_CURRENT,
        position: 1,
        processing_state: 'queued',
        attempt_count: 0,
      }),
    );
    const queues = buildFakeQueues();
    const service = buildService(state, buildFakeImages(), queues);
    await service.retryConfirmDocument(TEACHER_A, 'materials', MATERIALS_CURRENT);
    expect(queues.transcriptionSent).toHaveLength(1);
  });

  it('retry-confirm rejects a historical materials version', async () => {
    const state = freshState();
    const service = buildService(state);
    await expect(
      service.retryConfirmDocument(TEACHER_A, 'materials', MATERIALS_HISTORICAL),
    ).rejects.toMatchObject({ code: 'HISTORICAL_VERSION_READ_ONLY', status: 409 });
  });
});

describe('AssignmentReaderService — replace page (TASK-011)', () => {
  it('replaces an unconfirmed page in place, keeping it unconfirmed', async () => {
    const state = freshState();
    state.pages.set('p1', newPageRow({ id: 'p1', materials_version_id: MATERIALS_DRAFT, position: 1 }));
    const queues = buildFakeQueues();
    const service = buildService(state, buildFakeImages(), queues);
    const result = await service.replacePage(TEACHER_A, 'p1', new ArrayBuffer(10));
    expect(result.replacedPageId).toBe('p1');
    expect(result.page.processingState).toBe('uploading');
    expect(result.page.pageRevision).toBe(2);
    expect(queues.transcriptionSent).toHaveLength(0); // not requeued
    expect(queues.deletionSent).toHaveLength(1); // old key scheduled for cleanup
    expect(state.pages.has('p1')).toBe(false); // old row gone; new id took the position
  });

  it('requeues immediately when replacing a failed confirmed page', async () => {
    const state = freshState();
    state.pages.set(
      'p1',
      newPageRow({
        id: 'p1',
        materials_version_id: MATERIALS_CURRENT,
        position: 1,
        processing_state: 'failed',
        failure_code: 'invalid_image',
        failure_message: 'bad image',
      }),
    );
    const queues = buildFakeQueues();
    const service = buildService(state, buildFakeImages(), queues);
    const result = await service.replacePage(TEACHER_A, 'p1', new ArrayBuffer(10));
    expect(result.page.processingState).toBe('queued');
    expect(queues.transcriptionSent).toHaveLength(1);
    expect(queues.transcriptionSent[0].isRetry).toBe(true);
  });

  it('rejects replacing a queued/transcribing/completed page', async () => {
    const state = freshState();
    state.pages.set(
      'p1',
      newPageRow({ id: 'p1', materials_version_id: MATERIALS_CURRENT, position: 1, processing_state: 'completed', draft: { schemaVersion: 1 } }),
    );
    const service = buildService(state);
    await expect(service.replacePage(TEACHER_A, 'p1', new ArrayBuffer(10))).rejects.toMatchObject({
      code: 'INVALID_STATE',
      status: 409,
    });
  });

  it('rejects replacing a page on a historical materials version', async () => {
    const state = freshState();
    state.pages.set(
      'p1',
      newPageRow({
        id: 'p1',
        materials_version_id: MATERIALS_HISTORICAL,
        position: 1,
        processing_state: 'failed',
        failure_code: 'invalid_image',
        failure_message: 'bad image',
      }),
    );
    const service = buildService(state);
    await expect(service.replacePage(TEACHER_A, 'p1', new ArrayBuffer(10))).rejects.toMatchObject({
      code: 'HISTORICAL_VERSION_READ_ONLY',
      status: 409,
    });
  });

  it('does not strand an unconfirmed sibling page when recovering a failed page (draft_confirmed regression)', async () => {
    // SUBMISSION_1 has one page that already failed (so it had previously
    // been confirmed) and one newer sibling page still `uploading` (i.e.
    // added after that confirmation, which resets draft_confirmed to
    // false — see insertPageRow / addPageRow). Recovering the failed page
    // must not flip draft_confirmed back to true: that would permanently
    // strand the uploading sibling, since confirmDocument() 409s once
    // draft_confirmed is already true.
    const state = freshState();
    state.pages.set(
      'failed-1',
      newPageRow({
        id: 'failed-1',
        document_type: 'submission',
        materials_version_id: null,
        submission_id: SUBMISSION_1,
        student_id: 'student-1',
        position: 1,
        processing_state: 'failed',
        failure_code: 'invalid_image',
        failure_message: 'bad image',
      }),
    );
    state.pages.set(
      'sibling-1',
      newPageRow({
        id: 'sibling-1',
        document_type: 'submission',
        materials_version_id: null,
        submission_id: SUBMISSION_1,
        student_id: 'student-1',
        position: 2,
        processing_state: 'uploading',
      }),
    );
    const queues = buildFakeQueues();
    const service = buildService(state, buildFakeImages(), queues);

    const result = await service.replacePage(TEACHER_A, 'failed-1', new ArrayBuffer(10));
    expect(result.page.processingState).toBe('queued'); // recovered immediately

    // Confirming the document (now with the replacement + the still-
    // uploading sibling) must succeed rather than 409 'already confirmed'.
    const confirmed = await service.confirmDocument(TEACHER_A, 'submission', SUBMISSION_1, [
      result.page.id,
      'sibling-1',
    ]);
    expect(confirmed.processingState).toBe('queued');
    expect(confirmed.pages.map((page) => page.processingState)).toEqual(['queued', 'queued']);
  });
});

describe('AssignmentReaderService — remove page (TASK-011)', () => {
  it('removes a draft-materials page and compacts trailing positions', async () => {
    const state = freshState();
    state.pages.set('p1', newPageRow({ id: 'p1', materials_version_id: MATERIALS_DRAFT, position: 1 }));
    state.pages.set('p2', newPageRow({ id: 'p2', materials_version_id: MATERIALS_DRAFT, position: 2 }));
    state.pages.set('p3', newPageRow({ id: 'p3', materials_version_id: MATERIALS_DRAFT, position: 3 }));
    const queues = buildFakeQueues();
    const service = buildService(state, buildFakeImages(), queues);
    const result = await service.removePage(TEACHER_A, 'p2');
    expect(result.created).toBe(true);
    expect(result.operation.targetType).toBe('page');
    expect(result.operation.status).toBe('pending');
    expect(state.pages.has('p2')).toBe(false);
    expect(state.pages.get('p3')?.position).toBe(2);
    expect(queues.deletionSent).toHaveLength(1);
  });

  it('replays an already-accepted removal with the same pending operation instead of 404', async () => {
    const state = freshState();
    state.pages.set('p1', newPageRow({ id: 'p1', materials_version_id: MATERIALS_DRAFT, position: 1 }));
    const queues = buildFakeQueues();
    const service = buildService(state, buildFakeImages(), queues);
    const first = await service.removePage(TEACHER_A, 'p1');
    expect(first.created).toBe(true);
    expect(state.pages.has('p1')).toBe(false);

    const replay = await service.removePage(TEACHER_A, 'p1');
    expect(replay.created).toBe(false);
    expect(replay.operation).toEqual(first.operation);
    // No second deletion operation or cleanup message is created on replay.
    expect(queues.deletionSent).toHaveLength(1);
  });

  it('rejects removing a page from current (successful) materials', async () => {
    const state = freshState();
    state.pages.set('p1', newPageRow({ id: 'p1', materials_version_id: MATERIALS_CURRENT, position: 1 }));
    const service = buildService(state);
    await expect(service.removePage(TEACHER_A, 'p1')).rejects.toMatchObject({
      code: 'INVALID_STATE',
      status: 409,
    });
  });

  it('allows removing a submission page even under archived ancestry', async () => {
    const state = freshState();
    state.pages.set(
      'p1',
      newPageRow({
        id: 'p1',
        document_type: 'submission',
        materials_version_id: null,
        submission_id: SUBMISSION_1,
        position: 1,
      }),
    );
    state.docs.set(SUBMISSION_1, { ...state.docs.get(SUBMISSION_1)!, class_status: 'archived' });
    const service = buildService(state);
    const result = await service.removePage(TEACHER_A, 'p1');
    expect(result.operation.status).toBe('pending');
  });
});

describe('AssignmentReaderService — single-page retry (TASK-015)', () => {
  it('retries a failed confirmed page: revision bump, reset state, queued delivery', async () => {
    const state = freshState();
    state.pages.set(
      'p1',
      newPageRow({
        id: 'p1',
        materials_version_id: MATERIALS_CURRENT,
        position: 1,
        processing_state: 'failed',
        attempt_count: 2,
        failure_code: 'provider_timeout',
        failure_message: 'timed out',
        page_revision: 3,
      }),
    );
    const queues = buildFakeQueues();
    const service = buildService(state, buildFakeImages(), queues);
    const beforeRevision = state.docs.get(MATERIALS_CURRENT)!.document_revision;
    const result = await service.retryPage(TEACHER_A, 'p1');
    expect(result.page.processingState).toBe('queued');
    expect(result.page.pageRevision).toBe(4);
    expect(result.page.attemptCount).toBe(0);
    expect(result.page.failure).toBeNull();
    expect(result.documentRevision).toBe(beforeRevision + 1);
    expect(queues.transcriptionSent).toHaveLength(1);
    expect(queues.transcriptionSent[0]).toMatchObject({
      pageId: 'p1',
      transcriptionRevision: 4,
      isRetry: true,
    });
  });

  it('rejects retrying a page that is not exactly failed', async () => {
    const state = freshState();
    state.pages.set(
      'p1',
      newPageRow({
        id: 'p1',
        materials_version_id: MATERIALS_CURRENT,
        position: 1,
        processing_state: 'completed',
        draft: { schemaVersion: 1 },
      }),
    );
    const service = buildService(state);
    await expect(service.retryPage(TEACHER_A, 'p1')).rejects.toMatchObject({
      code: 'INVALID_STATE',
      status: 409,
    });
  });

  it('rejects retrying a page on a historical materials version', async () => {
    const state = freshState();
    state.pages.set(
      'p1',
      newPageRow({
        id: 'p1',
        materials_version_id: MATERIALS_HISTORICAL,
        position: 1,
        processing_state: 'failed',
        failure_code: 'invalid_image',
        failure_message: 'bad image',
      }),
    );
    const service = buildService(state);
    await expect(service.retryPage(TEACHER_A, 'p1')).rejects.toMatchObject({
      code: 'HISTORICAL_VERSION_READ_ONLY',
      status: 409,
    });
  });

  it('rejects retrying a missing or cross-owner page as 404, not 403', async () => {
    const state = freshState();
    state.pages.set(
      'p1',
      newPageRow({
        id: 'p1',
        materials_version_id: MATERIALS_CURRENT,
        position: 1,
        processing_state: 'failed',
        failure_code: 'invalid_image',
        failure_message: 'bad image',
      }),
    );
    const service = buildService(state);
    await expect(service.retryPage(TEACHER_B, 'p1')).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      status: 404,
    });
    await expect(service.retryPage(TEACHER_A, 'nonexistent')).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      status: 404,
    });
  });

  it('surfaces 500 QUEUE_DELIVERY_FAILED but keeps the committed revision bump', async () => {
    const state = freshState();
    state.pages.set(
      'p1',
      newPageRow({
        id: 'p1',
        materials_version_id: MATERIALS_CURRENT,
        position: 1,
        processing_state: 'failed',
        failure_code: 'invalid_image',
        failure_message: 'bad image',
      }),
    );
    const queues = buildFakeQueues();
    queues.failTranscription = true;
    const service = buildService(state, buildFakeImages(), queues);
    await expect(service.retryPage(TEACHER_A, 'p1')).rejects.toMatchObject({
      code: 'QUEUE_DELIVERY_FAILED',
      status: 500,
    });
    // The DB side already committed despite the thrown response.
    expect(state.pages.get('p1')?.processing_state).toBe('queued');
  });
});

describe('AssignmentReaderService — whole-document retranscription (TASK-015)', () => {
  const seedCompletedSubmission = (state: FakeState, options: { edited?: boolean } = {}) => {
    state.docs.set(SUBMISSION_1, {
      ...state.docs.get(SUBMISSION_1)!,
      draft_confirmed: true,
      document_revision: 2,
    });
    state.pages.set(
      'sp1',
      newPageRow({
        id: 'sp1',
        document_type: 'submission',
        materials_version_id: null,
        submission_id: SUBMISSION_1,
        student_id: 'student-1',
        position: 1,
        processing_state: 'completed',
        draft: { schemaVersion: 1 },
        page_revision: 1,
        edited_by_teacher: options.edited ?? false,
      }),
    );
    state.pages.set(
      'sp2',
      newPageRow({
        id: 'sp2',
        document_type: 'submission',
        materials_version_id: null,
        submission_id: SUBMISSION_1,
        student_id: 'student-1',
        position: 2,
        processing_state: 'completed',
        draft: { schemaVersion: 1 },
        page_revision: 1,
      }),
    );
  };

  const consentedBody = {
    expectedDocumentRevision: 2,
    confirmed: true as const,
    overwriteTeacherEdits: false,
    resetQuestionJudgments: false,
  };

  it('retranscribes every current completed page with consent and bumps both revisions', async () => {
    const state = freshState();
    seedCompletedSubmission(state);
    const queues = buildFakeQueues();
    const service = buildService(state, buildFakeImages(), queues);
    const result = await service.retranscribeDocument(TEACHER_A, 'submission', SUBMISSION_1, consentedBody);
    expect(result.documentRevision).toBe(3);
    expect(result.pages).toHaveLength(2);
    expect(result.pages.every((page) => page.processingState === 'queued')).toBe(true);
    expect(result.pages.every((page) => page.pageRevision === 2)).toBe(true);
    expect(queues.transcriptionSent).toHaveLength(2);
    expect(queues.transcriptionSent.every((message) => message.isRetry)).toBe(true);
  });

  it('rejects when a current page is not completed', async () => {
    const state = freshState();
    seedCompletedSubmission(state);
    state.pages.set('sp2', { ...state.pages.get('sp2')!, processing_state: 'queued' });
    const service = buildService(state);
    await expect(
      service.retranscribeDocument(TEACHER_A, 'submission', SUBMISSION_1, consentedBody),
    ).rejects.toMatchObject({ code: 'INVALID_STATE', status: 409 });
  });

  it('rejects a stale expectedDocumentRevision with REVISION_CONFLICT context', async () => {
    const state = freshState();
    seedCompletedSubmission(state);
    const service = buildService(state);
    await expect(
      service.retranscribeDocument(TEACHER_A, 'submission', SUBMISSION_1, {
        ...consentedBody,
        expectedDocumentRevision: 1,
      }),
    ).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
      status: 409,
      context: { currentRevision: 2 },
    });
  });

  it('requires overwriteTeacherEdits consent when a current page was teacher-edited', async () => {
    const state = freshState();
    seedCompletedSubmission(state, { edited: true });
    const service = buildService(state);
    await expect(
      service.retranscribeDocument(TEACHER_A, 'submission', SUBMISSION_1, consentedBody),
    ).rejects.toMatchObject({ code: 'CONSENT_REQUIRED', status: 409 });
  });

  it('requires resetQuestionJudgments consent when the submission has current judgments', async () => {
    const state = freshState();
    seedCompletedSubmission(state);
    state.submissionsWithJudgments.add(SUBMISSION_1);
    const service = buildService(state);
    await expect(
      service.retranscribeDocument(TEACHER_A, 'submission', SUBMISSION_1, consentedBody),
    ).rejects.toMatchObject({ code: 'CONSENT_REQUIRED', status: 409 });
  });

  it('rejects retranscribing an unconfirmed document', async () => {
    const state = freshState();
    seedCompletedSubmission(state);
    state.docs.set(SUBMISSION_1, { ...state.docs.get(SUBMISSION_1)!, draft_confirmed: false });
    const service = buildService(state);
    await expect(
      service.retranscribeDocument(TEACHER_A, 'submission', SUBMISSION_1, consentedBody),
    ).rejects.toMatchObject({ code: 'INVALID_STATE', status: 409 });
  });

  it('rejects retranscribing a historical materials version', async () => {
    const state = freshState();
    const service = buildService(state);
    await expect(
      service.retranscribeDocument(TEACHER_A, 'materials', MATERIALS_HISTORICAL, consentedBody),
    ).rejects.toMatchObject({ code: 'HISTORICAL_VERSION_READ_ONLY', status: 409 });
  });
});

describe('AssignmentReaderService — authenticated image delivery (TASK-012)', () => {
  it('returns 404 for a missing page without leaking existence to other teachers', async () => {
    const state = freshState();
    const service = buildService(state);
    await expect(
      service.getPageImage(TEACHER_B, 'nonexistent', 'workspace', 0, null),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
  });

  it('renders the requested variant for the owning teacher', async () => {
    const state = freshState();
    state.pages.set('p1', newPageRow({ id: 'p1', materials_version_id: MATERIALS_CURRENT, position: 1 }));
    const service = buildService(state);
    const { contentType } = await service.getPageImage(TEACHER_A, 'p1', 'thumbnail', 90, null);
    expect(contentType).toBe('image/jpeg;variant=thumbnail;rotation=90');
  });
});

describe('page-image.repository pure helpers', () => {
  it('sniffs JPEG/PNG/HEIC signatures and rejects everything else', () => {
    expect(sniffImageSignature(new Uint8Array([0xff, 0xd8, 0xff, 0, 0]))).toBe('image/jpeg');
    expect(
      sniffImageSignature(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe('image/png');
    const heic = new Uint8Array(12);
    heic.set([0, 0, 0, 0x18], 0);
    heic.set([0x66, 0x74, 0x79, 0x70], 4); // 'ftyp'
    heic.set([0x68, 0x65, 0x69, 0x63], 8); // 'heic'
    expect(sniffImageSignature(heic)).toBe('image/heic');
    expect(sniffImageSignature(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull(); // %PDF
  });

  // TASK-010 acceptance: "real JPEG, PNG, and HEIC fixtures" — not just
  // hand-built magic-byte stubs, but actual encoder output (fixtures
  // generated with ImageMagick/sips; see tests/fixtures/images).
  it('sniffs real JPEG/PNG/HEIC fixture files', () => {
    const fixtureDir = join(__dirname, 'fixtures', 'images');
    const jpeg = new Uint8Array(readFileSync(join(fixtureDir, 'test.jpg')));
    const png = new Uint8Array(readFileSync(join(fixtureDir, 'test.png')));
    const heic = new Uint8Array(readFileSync(join(fixtureDir, 'test.heic')));
    expect(sniffImageSignature(jpeg)).toBe('image/jpeg');
    expect(sniffImageSignature(png)).toBe('image/png');
    expect(sniffImageSignature(heic)).toBe('image/heic');
  });

  it('converts a normalized region to a clamped pixel box', () => {
    expect(regionToPixelBox({ x: 0, y: 0, width: 1, height: 1 }, 1000, 2000)).toEqual({
      left: 0,
      top: 0,
      width: 1000,
      height: 2000,
    });
    expect(regionToPixelBox({ x: 0.5, y: 0.5, width: 0.6, height: 0.6 }, 1000, 1000)).toEqual({
      left: 500,
      top: 500,
      width: 500, // clamped to the canonical bound, not 600
      height: 500,
    });
  });
});
