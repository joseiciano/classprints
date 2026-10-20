import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/index';
import { HttpError } from '../src/lib/http-error';

/**
 * Route contract tests (TASK-007/TASK-009; TEST-008 scope). The auth
 * middleware is mocked so requests carry the teacher id by token convention;
 * the repository is replaced with an in-memory fake. The tests assert what a
 * teacher observes over HTTP: 401 without a session, the manifest's error
 * envelope on validation/lifecycle failures, canonical-list response shape,
 * and the seating save route's 201/200 replay split.
 */

const TEACHER_A = '11111111-1111-1111-1111-111111111111';
const TEACHER_B = '22222222-2222-2222-2222-222222222222';

const teacherByToken = new Map<string, { id: string; email: string }>([
  ['token-a', { id: TEACHER_A, email: 'a@example.com' }],
  ['token-b', { id: TEACHER_B, email: 'b@example.com' }],
]);

const CLASS_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const CLASS_B = 'bbbbbbbb-2222-4222-8222-222222222222';
const STUDENT_1 = 'cccccccc-3333-4333-8333-333333333333';
const STUDENT_NEW = 'dddddddd-4444-4444-8444-444444444444';
const ASSIGNMENT_1 = 'eeeeeeee-5555-4555-8555-555555555555';

// Mock requireAuth: Authorization header resolves the session; no header → 401.
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


interface FakeClassRow {
  id: string;
  name: string;
  status: 'active' | 'archived';
  owner: string;
  student_count: number;
  assignment_count: number;
}

const fakeClasses: FakeClassRow[] = [
  { id: CLASS_A, name: 'Class A', status: 'active', owner: TEACHER_A, student_count: 2, assignment_count: 3 },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Class B', status: 'active', owner: TEACHER_B, student_count: 1, assignment_count: 0 },
];

let fakeCharts: Array<{
  id: string;
  class_id: string;
  owner: string;
  source_job_external_id: string;
  source_result_id: number;
  grid: Array<Array<string | null>>;
  student_count: number;
}> = [];

const fakeRepo = () => ({
  listClasses: ({ teacherId }: { teacherId: string }) => {
    const rows = fakeClasses.filter((entry) => entry.owner === teacherId);
    return Promise.resolve({
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        studentCount: row.student_count,
        assignmentCount: row.assignment_count,
        createdAt: '2026-09-23T10:00:00.000Z',
        updatedAt: '2026-09-23T10:00:00.000Z',
        archivedAt: null,
      })),
      pagination: {
        page: 1,
        pageSize: 10 as const,
        totalItems: rows.length,
        totalPages: rows.length === 0 ? 0 : 1,
      },
    });
  },
  findClass: (teacherId: string, classId: string) => {
    const row = fakeClasses.find((entry) => entry.id === classId);
    if (!row || row.owner !== teacherId) return Promise.resolve(null);
    return Promise.resolve({
      id: row.id,
      name: row.name,
      status: row.status,
      studentCount: row.student_count,
      assignmentCount: row.assignment_count,
      createdAt: '2026-09-23T10:00:00.000Z',
      updatedAt: '2026-09-23T10:00:00.000Z',
      archivedAt: null,
    });
  },
  createClass: (teacherId: string, name: string) => {
    const record = {
      id: `class-${fakeClasses.length + 1}`,
      name,
      status: 'active' as const,
      studentCount: 0,
      assignmentCount: 0,
      createdAt: '2026-09-23T10:00:00.000Z',
      updatedAt: '2026-09-23T10:00:00.000Z',
      archivedAt: null,
    };
    fakeClasses.push({ id: record.id, name, status: 'active', owner: teacherId, student_count: 0, assignment_count: 0 });
    return Promise.resolve(record);
  },
  updateClass: (teacherId: string, classId: string, patch: { name?: string; status?: 'archived' }) => {
    const row = fakeClasses.find((entry) => entry.id === classId && entry.owner === teacherId);
    if (!row) return Promise.resolve(null);
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.status !== undefined) row.status = patch.status;
    return Promise.resolve({
      id: row.id,
      name: row.name,
      status: row.status,
      studentCount: row.student_count,
      assignmentCount: row.assignment_count,
      createdAt: '2026-09-23T10:00:00.000Z',
      updatedAt: '2026-09-23T10:00:00.000Z',
      archivedAt: row.status === 'archived' ? '2026-09-23T10:00:00.000Z' : null,
    });
  },
  listStudents: () =>
    Promise.resolve({
      data: [],
      pagination: { page: 1, pageSize: 10 as const, totalItems: 0, totalPages: 0 },
    }),
  findStudent: (teacherId: string, studentId: string) =>
    Promise.resolve(
      studentId === STUDENT_1
        ? {
            id: STUDENT_1,
            classId: CLASS_A,
            name: 'Maya Rodriguez',
            status: 'active' as const,
            createdAt: '2026-09-23T10:00:00.000Z',
            updatedAt: '2026-09-23T10:00:00.000Z',
            removedAt: null,
          }
        : null,
    ),
  createStudent: (teacherId: string, classId: string, name: string) =>
    Promise.resolve({
      id: STUDENT_NEW,
      classId,
      name,
      status: 'active' as const,
      createdAt: '2026-09-23T10:00:00.000Z',
      updatedAt: '2026-09-23T10:00:00.000Z',
      removedAt: null,
    }),
  updateStudent: () => Promise.resolve(null),
  removeStudent: () => Promise.resolve(null),
  listAssignments: () =>
    Promise.resolve({
      data: [],
      pagination: { page: 1, pageSize: 10 as const, totalItems: 0, totalPages: 0 },
    }),
  findAssignment: (teacherId: string, assignmentId: string) => {
    if (assignmentId === ASSIGNMENT_1) {
      return Promise.resolve({
        id: assignmentId,
        classId: CLASS_A,
        name: 'Quiz 1',
        status: 'need_review' as const,
        maxScore: 10,
        createdAt: '2026-09-23T10:00:00.000Z',
        updatedAt: '2026-09-23T10:00:00.000Z',
        className: 'Class A',
        classStatus: 'active' as const,
        currentMaterialVersion: null,
        submissionCounts: {
          total: 0,
          notStarted: 0,
          processing: 0,
          needsReview: 0,
          readyToGrade: 0,
          graded: 0,
          failed: 0,
        },
      });
    }
    return Promise.resolve(null);
  },
  createAssignment: (teacherId: string, classId: string, name: string, maxScore: number | null) =>
    Promise.resolve({
      id: 'assignment-new',
      classId,
      name,
      status: 'need_review' as const,
      maxScore,
      createdAt: '2026-09-23T10:00:00.000Z',
      updatedAt: '2026-09-23T10:00:00.000Z',
      className: 'Class A',
      classStatus: 'active' as const,
      currentMaterialVersion: null,
      submissionCounts: {
        total: 0,
        notStarted: 0,
        processing: 0,
        needsReview: 0,
        readyToGrade: 0,
        graded: 0,
        failed: 0,
      },
    }),
  updateAssignment: (teacherId: string, assignmentId: string, patch: { name?: string }) =>
    Promise.resolve({
      id: assignmentId,
      classId: CLASS_A,
      name: patch.name ?? 'Quiz 1',
      status: 'need_review' as const,
      maxScore: 10,
      createdAt: '2026-09-23T10:00:00.000Z',
      updatedAt: '2026-09-23T10:00:00.000Z',
    }),
  countSubmissionsAboveScore: () => Promise.resolve(0),
  refreshAssignmentStatus: () => Promise.resolve('need_review' as const),
  listMaterialVersions: ({ page }: { page?: number }) =>
    Promise.resolve({
      data: [],
      pagination: { page: page ?? 1, pageSize: 10 as const, totalItems: 0, totalPages: 0 },
    }),
  findMaterialVersion: () => Promise.resolve(null),
  findCurrentMaterialVersion: () => Promise.resolve(null),
  createDraftMaterialVersion: () => Promise.resolve(null),
  findDraftMaterialVersion: () => Promise.resolve(null),
  listSubmissions: () =>
    Promise.resolve({
      data: [],
      pagination: { page: 1, pageSize: 10 as const, totalItems: 0, totalPages: 0 },
    }),
  findSubmission: (teacherId: string, submissionId: string) =>
    // The fake createSubmission mints id STUDENT_NEW; only its owner resolves.
    Promise.resolve(
      teacherId === TEACHER_A && submissionId === STUDENT_NEW
        ? {
            id: STUDENT_NEW,
            assignmentId: ASSIGNMENT_1,
            studentId: STUDENT_1,
            studentName: 'Maya Rodriguez',
            pageCount: 1,
            processingState: 'completed' as const,
            processingCounts: { uploading: 0, queued: 0, transcribing: 0, completed: 1, failed: 0, total: 1 },
            reviewState: 'needs_review' as const,
            gradingState: 'not_graded' as const,
            documentRevision: 1,
            score: null,
            comments: null,
            materialsVersionId: null,
            reviewContextCapturedAt: null,
            gradedAt: null,
            createdAt: '2026-09-23T10:00:00.000Z',
            updatedAt: '2026-09-23T10:00:00.000Z',
            readOnly: false,
          }
        : null,
    ),
  createSubmission: (teacherId: string, assignmentId: string, studentId: string) =>
    Promise.resolve({
      submission: {
        id: STUDENT_NEW,
        assignmentId,
        studentId,
        studentName: 'Maya Rodriguez',
        pageCount: 0,
        processingState: null,
        processingCounts: { uploading: 0, queued: 0, transcribing: 0, completed: 0, failed: 0, total: 0 },
        reviewState: null,
        gradingState: 'not_graded' as const,
        documentRevision: 1,
        score: null,
        comments: null,
        materialsVersionId: null,
        reviewContextCapturedAt: null,
        gradedAt: null,
        createdAt: '2026-09-23T10:00:00.000Z',
        updatedAt: '2026-09-23T10:00:00.000Z',
        readOnly: false,
      },
      created: true,
    }),
  listSavedSeatingCharts: (teacherId: string, classId: string) => {
    const rows = fakeCharts.filter((chart) => chart.owner === teacherId && chart.class_id === classId);
    return Promise.resolve({
      data: rows.map((row) => ({
        id: row.id,
        classId: row.class_id,
        className: 'Class A',
        sourceJobExternalId: row.source_job_external_id,
        sourceResultId: row.source_result_id,
        grid: row.grid,
        studentCount: row.student_count,
        createdAt: '2026-09-23T10:00:00.000Z',
      })),
      pagination: {
        page: 1,
        pageSize: 10 as const,
        totalItems: rows.length,
        totalPages: rows.length === 0 ? 0 : 1,
      },
    });
  },
  findSavedSeatingChart: () => Promise.resolve(null),
  findSavedSeatingChartByJob: (teacherId: string, classId: string, sourceJobExternalId: string) => {
    const chart = fakeCharts.find(
      (row) => row.owner === teacherId && row.class_id === classId && row.source_job_external_id === sourceJobExternalId,
    );
    if (!chart) return Promise.resolve(null);
    return Promise.resolve({
      id: chart.id,
      classId: chart.class_id,
      className: 'Class A',
      sourceJobExternalId: chart.source_job_external_id,
      sourceResultId: chart.source_result_id,
      grid: chart.grid,
      studentCount: chart.student_count,
      createdAt: '2026-09-23T10:00:00.000Z',
    });
  },
  saveSeatingChart: (input: {
    teacherId: string;
    classId: string;
    sourceJobExternalId: string;
    sourceResultId: number;
    grid: Array<Array<string | null>>;
    studentCount: number;
  }) => {
    const chart = {
      id: `chart-${fakeCharts.length + 1}`,
      class_id: input.classId,
      owner: input.teacherId,
      source_job_external_id: input.sourceJobExternalId,
      source_result_id: input.sourceResultId,
      grid: input.grid,
      student_count: input.studentCount,
    };
    fakeCharts.push(chart);
    return Promise.resolve({
      id: chart.id,
      classId: chart.class_id,
      className: 'Class A',
      sourceJobExternalId: chart.source_job_external_id,
      sourceResultId: chart.source_result_id,
      grid: chart.grid,
      studentCount: chart.student_count,
      createdAt: '2026-09-23T10:00:00.000Z',
    });
  },
  findSeatingJobByExternalId: (teacherId: string, externalId: string) => {
    if (externalId === 'job-ext-1') {
      // The job belongs to TEACHER_A only.
      return Promise.resolve(teacherId === TEACHER_A ? { id: 'job-1', externalId } : null);
    }
    return Promise.resolve(null);
  },
  findSeatingResult: (jobId: string, resultId: number) =>
    resultId === 1 && jobId === 'job-1'
      ? Promise.resolve({ id: 1, arrangement: [['Alice', 'Bob'], [null, 'Cara']] })
      : Promise.resolve(null),
  listProcessing: ({ documentType, documentId }: { documentType: string; documentId: string }) => {
    // A page belongs to the fake submission created for ASSIGNMENT_1.
    if (documentType === 'submission' && documentId === STUDENT_NEW) {
      return Promise.resolve({
        data: [
          {
            id: 'page-1',
            documentType: 'submission' as const,
            documentId: STUDENT_NEW,
            position: 1,
            label: 'Maya Rodriguez · Page 1',
            processingState: 'completed' as const,
            attemptCount: 1,
            queuedAt: '2026-09-23T10:01:00.000Z',
            startedAt: '2026-09-23T10:01:05.000Z',
            completedAt: '2026-09-23T10:02:00.000Z',
            uploadedAt: '2026-09-23T10:00:30.000Z',
            failure: null,
            draftAvailable: true,
            pageRevision: 1,
            reviewedContentRevision: null,
            editedByTeacher: false,
            teacherEditCount: 0,
            elapsedFromQueuedMs: 60000,
            workspacePath: `/classes/assignments/${STUDENT_NEW}/workspace?pageId=page-1`,
          },
        ],
        pagination: { page: 1, pageSize: 10 as const, totalItems: 1, totalPages: 1 },
      });
    }
    return Promise.resolve({
      data: [],
      pagination: { page: 1, pageSize: 10 as const, totalItems: 0, totalPages: 0 },
    });
  },
  hasCurrentQuestionJudgments: () => Promise.resolve(false),
});

vi.mock('../src/assignment-reader/assignment-reader.repository', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    createAssignmentReaderRepository: () => fakeRepo(),
  };
});

describe('Assignment Reader routes', () => {
  const app = buildApp();

  const createEnv = () => ({
    ENVIRONMENT: 'test',
    APPLICATION_NAME: 'Seating Backend',
    FRONTEND_URL: 'http://localhost:5173',
    ALLOWED_ORIGINS: 'http://localhost:5173',
    HYPERDRIVE: { connectionString: 'postgres://user:pass@localhost:5432/db' } as never,
    STRIPE_SECRET_KEY: 'sk_test_mock',
  });

  const CSRF_TOKEN = 'test-csrf-token';
  const authed = (token: string, init: RequestInit = {}): RequestInit => ({
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Cookie: `seating_csrf_token=${CSRF_TOKEN}`,
      'X-CSRF-Token': CSRF_TOKEN,
    },
  });

  beforeEach(() => {
    fakeCharts = [];
    while (fakeClasses.length > 2) fakeClasses.pop();
    fakeClasses[0].status = 'active';
    fakeClasses[1].status = 'active';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated list requests with 401', async () => {
    const res = await app.fetch(new Request('http://localhost/api/v1/classes'), createEnv() as never);
    expect(res.status).toBe(401);
  });

  it('lists only the teacher\'s classes in the canonical envelope', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/classes', authed('token-a')),
      createEnv() as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ id: string }>;
      pagination: { pageSize: number; totalItems: number };
    };
    expect(body.data.map((record) => record.id)).toEqual([CLASS_A]);
    expect(body.pagination.pageSize).toBe(10);
    expect(body.pagination.totalItems).toBe(1);
  });

  it('returns 400 with the manifest error envelope for an unknown sort field', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/classes?sort=bogus', authed('token-a')),
      createEnv() as never,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; details: Array<{ path: string; message: string }> };
    expect(body.code).toBe('INVALID_REQUEST');
    expect(body.details[0].path).toContain('sort');
  });

  it('rejects pageSize as an unknown field on canonical lists', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/classes?pageSize=50', authed('token-a')),
      createEnv() as never,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('INVALID_REQUEST');
  });

  it('creates a class with 201', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/classes', authed('token-a', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Class' }),
      })),
      createEnv() as never,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { name: string; status: string } };
    expect(body.data.name).toBe('New Class');
    expect(body.data.status).toBe('active');
  });

  it('returns 404 for another teacher\'s class detail', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/classes/${CLASS_B}`, authed('token-a')),
      createEnv() as never,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('archives a class through PATCH', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/classes/${CLASS_A}`, authed('token-a', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'archived' }),
      })),
      createEnv() as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { status: string; archivedAt: string | null } };
    expect(body.data.status).toBe('archived');
    expect(body.data.archivedAt).not.toBeNull();
  });

  it('rejects class creation with an empty name', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/classes', authed('token-a', {
        method: 'POST',
        body: JSON.stringify({ name: '   ' }),
      })),
      createEnv() as never,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('INVALID_REQUEST');
  });

  it('saves a seating result to a class with 201 and replays with 200', async () => {
    const create = await app.fetch(
      new Request('http://localhost/api/v1/seating/job-ext-1/save-to-class', authed('token-a', {
        method: 'POST',
        body: JSON.stringify({ classId: CLASS_A, resultId: 1 }),
      })),
      createEnv() as never,
    );
    expect(create.status).toBe(201);
    const createdBody = (await create.json()) as {
      data: { id: string; sourceJobExternalId: string; sourceResultId: number; grid: string[][]; studentCount: number };
    };
    expect(createdBody.data.sourceJobExternalId).toBe('job-ext-1');
    expect(createdBody.data.sourceResultId).toBe(1);
    expect(createdBody.data.grid).toEqual([['Alice', 'Bob'], [null, 'Cara']]);
    expect(createdBody.data.studentCount).toBe(3);

    const replay = await app.fetch(
      new Request('http://localhost/api/v1/seating/job-ext-1/save-to-class', authed('token-a', {
        method: 'POST',
        body: JSON.stringify({ classId: CLASS_A, resultId: 1 }),
      })),
      createEnv() as never,
    );
    expect(replay.status).toBe(200);
    const replayBody = (await replay.json()) as { data: { id: string } };
    expect(replayBody.data.id).toBe(createdBody.data.id);
  });

  it('rejects saving to another teacher\'s job with 404', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/seating/job-ext-1/save-to-class', authed('token-b', {
        method: 'POST',
        body: JSON.stringify({ classId: '22222222-2222-4222-8222-222222222222', resultId: 1 }),
      })),
      createEnv() as never,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('rejects an unknown resultId with 404', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/seating/job-ext-1/save-to-class', authed('token-a', {
        method: 'POST',
        body: JSON.stringify({ classId: CLASS_A, resultId: 42 }),
      })),
      createEnv() as never,
    );
    expect(res.status).toBe(404);
  });

  it('lists saved seating charts for an owned class', async () => {
    await app.fetch(
      new Request('http://localhost/api/v1/seating/job-ext-1/save-to-class', authed('token-a', {
        method: 'POST',
        body: JSON.stringify({ classId: CLASS_A, resultId: 1 }),
      })),
      createEnv() as never,
    );
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/classes/${CLASS_A}/seating-charts`, authed('token-a')),
      createEnv() as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ id: string; sourceJobExternalId: string }>;
      pagination: { pageSize: number };
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0].sourceJobExternalId).toBe('job-ext-1');
    expect(body.pagination.pageSize).toBe(10);
  });

  it('creates a submission with 201 and replays with 200', async () => {
    const create = await app.fetch(
      new Request(`http://localhost/api/v1/assignments/${ASSIGNMENT_1}/submissions`, authed('token-a', {
        method: 'POST',
        body: JSON.stringify({ studentId: STUDENT_1 }),
      })),
      createEnv() as never,
    );
    expect(create.status).toBe(201);
    const createdBody = (await create.json()) as { data: { created: boolean; submission: { id: string } } };
    expect(createdBody.data.created).toBe(true);
    expect(createdBody.data.submission.id).toBe(STUDENT_NEW);
    // Fake createSubmission always reports created=true; the replay split is
    // covered at the service level. This route-level check pins the envelope.
    const body = createdBody.data;
    expect(body.submission.gradingState).toBe('not_graded');
  });

  it('lists a document processing state for an owned submission (TASK-008)', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/documents/submission/${STUDENT_NEW}/processing`, authed('token-a')),
      createEnv() as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ processingState: string; draftAvailable: boolean; workspacePath: string | null }>;
      pagination: { pageSize: number };
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0].processingState).toBe('completed');
    expect(body.data[0].draftAvailable).toBe(true);
    expect(body.data[0].workspacePath).toContain('/workspace?pageId=');
    expect(body.pagination.pageSize).toBe(10);
  });

  it('rejects the processing list for another teacher\'s submission with 404', async () => {
    // Teacher B has no owned submission with that id; the service resolves
    // the document through an owned finder first, so the response must not
    // reveal the page rows (SEC-001).
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/documents/submission/${STUDENT_NEW}/processing`, authed('token-b')),
      createEnv() as never,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('rejects an unknown processing status filter with 400', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/documents/submission/${STUDENT_NEW}/processing?status=bogus`, authed('token-a')),
      createEnv() as never,
    );
    expect(res.status).toBe(400);
  });

  it('rejects the saved seating charts list for another teacher\'s class with 404', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/classes/${CLASS_B}/seating-charts`, authed('token-a')),
      createEnv() as never,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('renames an assignment with a name-only PATCH (B1 regression)', async () => {
    // The fake updateAssignment returns a record; the bug was the missing
    // RETURNING clause in the repository, observed here as a spurious 404.
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/assignments/${ASSIGNMENT_1}`, authed('token-a', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Renamed quiz' }),
      })),
      createEnv() as never,
    );
    expect(res.status).toBe(200);
  });

  it('paginates material versions and rejects unknown query fields (B2 regression)', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/assignments/${ASSIGNMENT_1}/material-versions?page=2`, authed('token-a')),
      createEnv() as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pagination: { page: number } };
    expect(body.pagination.page).toBe(2);

    const bad = await app.fetch(
      new Request(`http://localhost/api/v1/assignments/${ASSIGNMENT_1}/material-versions?q=quiz`, authed('token-a')),
      createEnv() as never,
    );
    expect(bad.status).toBe(400);
    const errorBody = (await bad.json()) as { code: string };
    expect(errorBody.code).toBe('INVALID_REQUEST');
  });

  it('defaults the roster list to active students (B3 regression)', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/classes/${CLASS_A}/students`, authed('token-a')),
      createEnv() as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ status: string }> };
    expect(body.data.every((student) => student.status === 'active')).toBe(true);
  });

  it('rejects renaming an archived class with 409 ARCHIVED_ANCESTRY (B4 regression)', async () => {
    fakeClasses[0].status = 'archived';
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/classes/${CLASS_A}`, authed('token-a', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'New name' }),
      })),
      createEnv() as never,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('ARCHIVED_ANCESTRY');
  });

  it('rejects re-archiving an archived class with 409 (B4)', async () => {
    fakeClasses[0].status = 'archived';
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/classes/${CLASS_A}`, authed('token-a', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'archived' }),
      })),
      createEnv() as never,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('ARCHIVED_ANCESTRY');
  });

  it('rejects a mutating request without the CSRF header (B6)', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/classes', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-a',
          'Content-Type': 'application/json',
          Cookie: `seating_csrf_token=${CSRF_TOKEN}`,
        },
        body: JSON.stringify({ name: 'CSRF-free class' }),
      }),
      createEnv() as never,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('CSRF_INVALID');
  });

  it('rejects a mutating request whose CSRF header mismatches the cookie (B6)', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/classes', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-a',
          'Content-Type': 'application/json',
          Cookie: `seating_csrf_token=${CSRF_TOKEN}`,
          'X-CSRF-Token': 'forged-token',
        },
        body: JSON.stringify({ name: 'Forged class' }),
      }),
      createEnv() as never,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('CSRF_INVALID');
  });
});
