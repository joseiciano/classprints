import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/index';
import { HttpError } from '../src/lib/http-error';
import type { AssignmentReaderRepository } from '../src/assignment-reader/assignment-reader.repository';
import type {
  DocumentStatusRow,
  PageRow,
  DeletionOperationRow,
  PageImageDeliveryRow,
} from '../src/assignment-reader/assignment-reader.types';
import type { PageImageRepository, ImageByteStream } from '../src/assignment-reader/page-image.repository';
import { sniffImageSignature, UnsupportedImageError, MAX_UPLOAD_BYTES } from '../src/assignment-reader/page-image.repository';

/**
 * Route-level tests for the page upload/replace/image-delivery endpoints
 * (TASK-010/TASK-011/TASK-012; TEST-004 scope): multipart field handling,
 * the 10 MB body-size boundary, and image-delivery query validation, driven
 * through the real Hono app over `app.fetch` with real JPEG/PNG/HEIC fixture
 * bytes (see tests/fixtures/images) rather than the in-memory service-layer
 * fakes that assignment-reader.pages.service.test.ts exercises. The
 * repository and the image/queue bindings are faked at the same seams
 * assignment-reader.routes.test.ts uses, so these assert what a teacher
 * observes over HTTP: multipart validation, the body-limit 413, and the
 * manifest error envelope for a bad query — not repository behavior (see
 * assignment-reader.repository.integration.test.ts for that).
 */

const TEACHER_A = '11111111-1111-1111-1111-111111111111';
const TEACHER_B = '22222222-2222-2222-2222-222222222222';
const CLASS_1 = 'cccccccc-0000-4000-8000-000000000001';
const ASSIGNMENT_1 = 'dddddddd-0000-4000-8000-000000000001';
const STUDENT_1 = 'eeeeeeee-0000-4000-8000-000000000001';
const SUBMISSION_1 = 'bbbbbbbb-0000-4000-8000-000000000001';
const UPLOADING_PAGE = 'ffffffff-0000-4000-8000-000000000001';
const FIXTURE_DIR = join(__dirname, 'fixtures', 'images');

const teacherByToken = new Map<string, { id: string; email: string }>([
  ['token-a', { id: TEACHER_A, email: 'a@example.com' }],
  ['token-b', { id: TEACHER_B, email: 'b@example.com' }],
]);

vi.mock('@classprints/server/auth', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    requireAuth: vi.fn(() =>
      vi.fn(async (c: { req: { header: (name: string) => string | undefined }; set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
        const authHeader = c.req.header('Authorization');
        const token = authHeader?.replace(/^Bearer\s+/i, '');
        const user = token ? teacherByToken.get(token) : undefined;
        if (!user) {
          throw new HttpError(401, 'Invalid or expired access token');
        }
        c.set('user', user);
        await next();
      }),
    ),
  };
});

const notImplemented = (name: string) => () => {
  throw new Error(`fake repository: ${name} is not used by these tests`);
};

const newPageRow = (overrides: Partial<PageRow> & { id: string }): PageRow => ({
  document_type: 'submission',
  materials_version_id: null,
  submission_id: SUBMISSION_1,
  student_id: STUDENT_1,
  class_id: CLASS_1,
  assignment_id: ASSIGNMENT_1,
  teacher_id: TEACHER_A,
  position: 1,
  label: 'Page 1',
  storage_key: `teacher/${TEACHER_A}/class/${CLASS_1}/assignment/${ASSIGNMENT_1}/submission/${overrides.id}.jpg`,
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

let pages: Map<string, PageRow>;

const docStatus: DocumentStatusRow = {
  document_type: 'submission',
  document_id: SUBMISSION_1,
  document_revision: 1,
  draft_confirmed: false,
  class_id: CLASS_1,
  assignment_id: ASSIGNMENT_1,
  student_id: STUDENT_1,
  class_status: 'active',
  student_name: 'Maya Rodriguez',
  lifecycle: null,
};

const fakeRepo = (): AssignmentReaderRepository => ({
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
  promoteDraftMaterials: notImplemented('promoteDraftMaterials'),
  listDocumentPageRows: notImplemented('listDocumentPageRows'),
  countDocumentPages: notImplemented('countDocumentPages'),
  insertPageRow: notImplemented('insertPageRow'),
  confirmDocumentOrder: notImplemented('confirmDocumentOrder'),
  listQueuedUndeliveredPages: notImplemented('listQueuedUndeliveredPages'),
  removePageRow: notImplemented('removePageRow'),
  findPendingDeletionOperation: notImplemented('findPendingDeletionOperation'),
  listProcessing: notImplemented('listProcessing'),
  retryPageRow: notImplemented('retryPageRow'),
  retranscribeDocumentRows: notImplemented('retranscribeDocumentRows'),
  hasCurrentQuestionJudgments: notImplemented('hasCurrentQuestionJudgments'),
  listSubmissions: notImplemented('listSubmissions'),
  findSubmission: notImplemented('findSubmission'),
  createSubmission: notImplemented('createSubmission'),
  listSavedSeatingCharts: notImplemented('listSavedSeatingCharts'),
  findSavedSeatingChart: notImplemented('findSavedSeatingChart'),
  findSavedSeatingChartByJob: notImplemented('findSavedSeatingChartByJob'),
  saveSeatingChart: notImplemented('saveSeatingChart'),
  findSeatingJobByExternalId: notImplemented('findSeatingJobByExternalId'),
  findSeatingResult: notImplemented('findSeatingResult'),

  async findDocumentStatus(teacherId, documentType, documentId) {
    if (documentType !== 'submission' || documentId !== SUBMISSION_1) return null;
    return teacherId === TEACHER_A ? docStatus : null;
  },

  async findPage(teacherId, pageId) {
    const page = pages.get(pageId);
    if (!page || page.teacher_id !== teacherId) return null;
    return page;
  },

  async replacePageRow(input) {
    const old = pages.get(input.replacedPageId);
    if (!old) throw new Error('Replaced page not found');
    pages.delete(input.replacedPageId);
    const row = newPageRow({
      id: input.id,
      position: input.position,
      label: input.label,
      storage_key: input.storageKey,
      page_revision: input.pageRevision,
      processing_state: input.requeueImmediately ? 'queued' : 'uploading',
      queued_at_ms: input.requeueImmediately ? Date.now() : null,
    });
    pages.set(row.id, row);
    return { page: row, documentRevision: docStatus.document_revision + 1, replacedStorageKey: old.storage_key };
  },

  async createDeletionOperation(input): Promise<DeletionOperationRow> {
    return {
      id: 'deletion-op-1',
      target_type: input.targetType,
      target_id: input.targetId,
      status: 'pending',
      accepted_at_ms: Date.now(),
    };
  },

  async findPageImageSource(teacherId, pageId): Promise<PageImageDeliveryRow | null> {
    const page = pages.get(pageId);
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
});

// Thin, real-signature-checking fake: unlike the service-layer tests'
// `buildFakeImages`, this actually runs the uploaded bytes through
// `sniffImageSignature` so the route test proves spoofed/unsupported bytes
// are rejected end to end, with real JPEG/PNG/HEIC fixtures proving the
// happy path (TASK-010 acceptance: "real JPEG, PNG, and HEIC fixtures").
const fakeImages = (): PageImageRepository => ({
  async storeNormalizedImage({ bytes }) {
    const head = new Uint8Array(bytes.slice(0, 16));
    if (!sniffImageSignature(head)) {
      throw new UnsupportedImageError('File is not a JPEG, PNG, or HEIC image');
    }
  },
  async deleteObject() {
    // no-op
  },
  async renderVariant({ variant, rotation }) {
    return {
      body: new ReadableStream() as unknown as ImageByteStream,
      contentType: `image/jpeg;variant=${variant};rotation=${rotation}`,
    };
  },
});

vi.mock('../src/assignment-reader/assignment-reader.repository', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, createAssignmentReaderRepository: () => fakeRepo() };
});

vi.mock('../src/assignment-reader/page-image.repository', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, createPageImageRepository: () => fakeImages() };
});

describe('Assignment Reader page routes (TASK-010/TASK-011/TASK-012)', () => {
  const app = buildApp();

  const createEnv = () => ({
    ENVIRONMENT: 'test',
    APPLICATION_NAME: 'Seating Backend',
    FRONTEND_URL: 'http://localhost:5173',
    ALLOWED_ORIGINS: 'http://localhost:5173',
    HYPERDRIVE: { connectionString: 'postgres://user:pass@localhost:5432/db' } as never,
    STRIPE_SECRET_KEY: 'sk_test_mock',
    ASSIGNMENT_IMAGES: {} as never,
    IMAGES: {} as never,
    TRANSCRIPTION_JOBS: { send: vi.fn(async () => {}), sendBatch: vi.fn(async () => {}) } as never,
    DOCUMENT_CLEANUP_JOBS: { send: vi.fn(async () => {}), sendBatch: vi.fn(async () => {}) } as never,
  });

  const CSRF_TOKEN = 'test-csrf-token';
  const authHeaders = (token: string, extra: Record<string, string> = {}): Record<string, string> => ({
    Authorization: `Bearer ${token}`,
    Cookie: `seating_csrf_token=${CSRF_TOKEN}`,
    'X-CSRF-Token': CSRF_TOKEN,
    ...extra,
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const resetPages = () => {
    pages = new Map([[UPLOADING_PAGE, newPageRow({ id: UPLOADING_PAGE })]]);
  };

  describe('POST /pages/:pageId/replace', () => {
    it('accepts a real JPEG fixture and returns the replacement page', async () => {
      resetPages();
      const bytes = readFileSync(join(FIXTURE_DIR, 'test.jpg'));
      const form = new FormData();
      form.append('file', new File([bytes], 'test.jpg', { type: 'image/jpeg' }));
      const res = await app.fetch(
        new Request(`http://localhost/api/v1/pages/${UPLOADING_PAGE}/replace`, {
          method: 'POST',
          headers: authHeaders('token-a'),
          body: form,
        }),
        createEnv() as never,
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as { data: { page: { id: string; processingState: string } } };
      expect(body.data.page.id).not.toBe(UPLOADING_PAGE); // immutable replacement id
      expect(body.data.page.processingState).toBe('uploading'); // was `uploading`, stays unconfirmed
    });

    it('accepts real PNG and HEIC fixtures too', async () => {
      for (const [file, type] of [
        ['test.png', 'image/png'],
        ['test.heic', 'image/heic'],
      ] as const) {
        resetPages();
        const bytes = readFileSync(join(FIXTURE_DIR, file));
        const form = new FormData();
        form.append('file', new File([bytes], file, { type }));
        const res = await app.fetch(
          new Request(`http://localhost/api/v1/pages/${UPLOADING_PAGE}/replace`, {
            method: 'POST',
            headers: authHeaders('token-a'),
            body: form,
          }),
          createEnv() as never,
        );
        expect(res.status).toBe(201);
      }
    });

    it('rejects a request with no "file" field as INVALID_MULTIPART', async () => {
      resetPages();
      const form = new FormData();
      form.append('notFile', 'hello');
      const res = await app.fetch(
        new Request(`http://localhost/api/v1/pages/${UPLOADING_PAGE}/replace`, {
          method: 'POST',
          headers: authHeaders('token-a'),
          body: form,
        }),
        createEnv() as never,
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('INVALID_MULTIPART');
    });

    it('rejects a JSON body (not multipart) as INVALID_MULTIPART', async () => {
      resetPages();
      const res = await app.fetch(
        new Request(`http://localhost/api/v1/pages/${UPLOADING_PAGE}/replace`, {
          method: 'POST',
          headers: authHeaders('token-a', { 'Content-Type': 'application/json' }),
          body: JSON.stringify({ file: 'not-multipart' }),
        }),
        createEnv() as never,
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('INVALID_MULTIPART');
    });

    it('rejects a spoofed/unsupported file signature as UNSUPPORTED_IMAGE', async () => {
      resetPages();
      const form = new FormData();
      // %PDF magic bytes, dressed up with a .jpg filename/MIME type.
      form.append('file', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])], 'fake.jpg', { type: 'image/jpeg' }));
      const res = await app.fetch(
        new Request(`http://localhost/api/v1/pages/${UPLOADING_PAGE}/replace`, {
          method: 'POST',
          headers: authHeaders('token-a'),
          body: form,
        }),
        createEnv() as never,
      );
      expect(res.status).toBe(415);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('UNSUPPORTED_IMAGE');
    });

    it('rejects a body over the 10 MB limit with 413 before multipart parsing', async () => {
      resetPages();
      // uploadBodyLimit's maxSize is MAX_UPLOAD_BYTES + 65_536 headroom;
      // this multipart body's total size (boundary framing included) pushes
      // well past it (TASK-010 acceptance: "10 MB + 1 byte" fails).
      const oversized = new Uint8Array(MAX_UPLOAD_BYTES + 100_000);
      const form = new FormData();
      form.append('file', new File([oversized], 'big.jpg', { type: 'image/jpeg' }));
      const res = await app.fetch(
        new Request(`http://localhost/api/v1/pages/${UPLOADING_PAGE}/replace`, {
          method: 'POST',
          headers: authHeaders('token-a'),
          body: form,
        }),
        createEnv() as never,
      );
      expect(res.status).toBe(413);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('IMAGE_TOO_LARGE');
    });

    it('returns 404 (not 403) for another teacher\'s page', async () => {
      resetPages();
      const bytes = readFileSync(join(FIXTURE_DIR, 'test.jpg'));
      const form = new FormData();
      form.append('file', new File([bytes], 'test.jpg', { type: 'image/jpeg' }));
      const res = await app.fetch(
        new Request(`http://localhost/api/v1/pages/${UPLOADING_PAGE}/replace`, {
          method: 'POST',
          headers: authHeaders('token-b'),
          body: form,
        }),
        createEnv() as never,
      );
      expect(res.status).toBe(404);
    });

    it('rejects an unauthenticated replace with 401', async () => {
      resetPages();
      const form = new FormData();
      form.append('file', new File([new Uint8Array([0xff, 0xd8, 0xff])], 'test.jpg', { type: 'image/jpeg' }));
      const res = await app.fetch(
        new Request(`http://localhost/api/v1/pages/${UPLOADING_PAGE}/replace`, { method: 'POST', body: form }),
        createEnv() as never,
      );
      expect(res.status).toBe(401);
    });
  });

  describe('GET /pages/:pageId/image', () => {
    it('renders the default (workspace, unrotated) variant for the owner', async () => {
      resetPages();
      const res = await app.fetch(
        new Request(`http://localhost/api/v1/pages/${UPLOADING_PAGE}/image`, {
          headers: authHeaders('token-a'),
        }),
        createEnv() as never,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/jpeg;variant=workspace;rotation=0');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('Cache-Control')).toContain('private');
    });

    it('rejects an unknown variant with the manifest validation envelope', async () => {
      resetPages();
      const res = await app.fetch(
        new Request(`http://localhost/api/v1/pages/${UPLOADING_PAGE}/image?variant=bogus`, {
          headers: authHeaders('token-a'),
        }),
        createEnv() as never,
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('INVALID_REQUEST');
    });

    it('rejects an invalid rotation value', async () => {
      resetPages();
      const res = await app.fetch(
        new Request(`http://localhost/api/v1/pages/${UPLOADING_PAGE}/image?rotation=45`, {
          headers: authHeaders('token-a'),
        }),
        createEnv() as never,
      );
      expect(res.status).toBe(400);
    });

    it('rejects a region variant missing crop coordinates', async () => {
      resetPages();
      const res = await app.fetch(
        new Request(`http://localhost/api/v1/pages/${UPLOADING_PAGE}/image?variant=region`, {
          headers: authHeaders('token-a'),
        }),
        createEnv() as never,
      );
      expect(res.status).toBe(400);
    });

    it('accepts a fully specified region crop', async () => {
      resetPages();
      const res = await app.fetch(
        new Request(
          `http://localhost/api/v1/pages/${UPLOADING_PAGE}/image?variant=region&x=0&y=0&width=0.5&height=0.5`,
          { headers: authHeaders('token-a') },
        ),
        createEnv() as never,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/jpeg;variant=region;rotation=0');
    });

    it('returns 404 (not 403) for another teacher\'s page', async () => {
      resetPages();
      const res = await app.fetch(
        new Request(`http://localhost/api/v1/pages/${UPLOADING_PAGE}/image`, {
          headers: authHeaders('token-b'),
        }),
        createEnv() as never,
      );
      expect(res.status).toBe(404);
    });

    it('rejects an unauthenticated request with 401', async () => {
      resetPages();
      const res = await app.fetch(
        new Request(`http://localhost/api/v1/pages/${UPLOADING_PAGE}/image`),
        createEnv() as never,
      );
      expect(res.status).toBe(401);
    });
  });

  describe('POST /documents/:documentType/:documentId/analytics-events (TASK-027)', () => {
    const post = (token: string, body: unknown) =>
      app.fetch(
        new Request(`http://localhost/api/v1/documents/submission/${SUBMISSION_1}/analytics-events`, {
          method: 'POST',
          headers: authHeaders(token, { 'Content-Type': 'application/json' }),
          body: JSON.stringify(body),
        }),
        createEnv() as never,
      );

    it('accepts a review_session_start event with a null-data envelope', async () => {
      const res = await post('token-a', { type: 'review_session_start' });
      expect(res.status).toBe(202);
      expect(await res.json()).toEqual({ data: null });
    });

    it('accepts a review_session_end event carrying a duration', async () => {
      const res = await post('token-a', { type: 'review_session_end', durationMs: 90_000 });
      expect(res.status).toBe(202);
    });

    it('accepts a materials_open event', async () => {
      const res = await post('token-a', { type: 'materials_open' });
      expect(res.status).toBe(202);
    });

    it('rejects an unknown event type with the manifest validation envelope', async () => {
      const res = await post('token-a', { type: 'bogus_event' });
      expect(res.status).toBe(400);
    });

    it('rejects a negative durationMs', async () => {
      const res = await post('token-a', { type: 'review_session_end', durationMs: -1 });
      expect(res.status).toBe(400);
    });

    it('returns 404 (not 403) for another teacher\'s submission', async () => {
      const res = await post('token-b', { type: 'materials_open' });
      expect(res.status).toBe(404);
    });

    it('rejects an unauthenticated request with 401', async () => {
      const res = await app.fetch(
        new Request(`http://localhost/api/v1/documents/submission/${SUBMISSION_1}/analytics-events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'materials_open' }),
        }),
        createEnv() as never,
      );
      expect(res.status).toBe(401);
    });
  });
});
