import { describe, expect, it } from 'vitest';
import {
  AssignmentReaderError,
  AssignmentReaderService,
} from '../src/assignment-reader/assignment-reader.service';
import type { AssignmentReaderRepository } from '../src/assignment-reader/assignment-reader.repository';
import type { SaveSeatingChartInput } from '../src/assignment-reader/assignment-reader.repository';
import { DeletionScopeConflictError } from '../src/assignment-reader/assignment-reader.types';
import type { DeletionOperationRow } from '../src/assignment-reader/assignment-reader.types';
import type {
  ClassRecord,
  ClassListQuery,
  ListResponse,
  MaterialVersionSummary,
  SavedSeatingChart,
  StudentRecord,
  SubmissionRecord,
  AssignmentRecord,
} from '@classprints/assignment-reader-shared';

/**
 * Service contract tests (TASK-007/TASK-009; TEST-003 scope). An in-memory
 * fake repository stands in for Postgres so the tests exercise service-level
 * authorization, archived-ancestry denial, idempotent draft creation,
 * one-submission-per-student replay, and save-to-class idempotency — the
 * rules the plan says must be enforced at the service boundary.
 */

const TEACHER_A = '11111111-1111-1111-1111-111111111111';
const TEACHER_B = '22222222-2222-2222-2222-222222222222';

const classRecord = (teacherId: string, id: string, name: string, status: 'active' | 'archived' = 'active'): ClassRecord => ({
  id,
  name,
  status,
  studentCount: 0,
  assignmentCount: 0,
  createdAt: '2026-09-23T10:00:00.000Z',
  updatedAt: '2026-09-23T10:00:00.000Z',
  archivedAt: status === 'archived' ? '2026-09-23T10:00:00.000Z' : null,
});

const studentRecord = (teacherId: string, classId: string, id: string, name: string, status: 'active' | 'removed' = 'active'): StudentRecord => ({
  id,
  classId,
  name,
  status,
  createdAt: '2026-09-23T10:00:00.000Z',
  updatedAt: '2026-09-23T10:00:00.000Z',
  removedAt: null,
});

const submissionRecord = (teacherId: string, id: string, assignmentId: string, studentId: string, classId: string): SubmissionRecord => ({
  id,
  assignmentId,
  studentId,
  studentName: 'Maya Rodriguez',
  pageCount: 0,
  processingState: null,
  processingCounts: { uploading: 0, queued: 0, transcribing: 0, completed: 0, failed: 0, total: 0 },
  reviewState: null,
  gradingState: 'not_graded',
  documentRevision: 1,
  score: null,
  comments: null,
  materialsVersionId: null,
  reviewContextCapturedAt: null,
  gradedAt: null,
  createdAt: '2026-09-23T10:00:00.000Z',
  updatedAt: '2026-09-23T10:00:00.000Z',
  readOnly: false,
});

const materialVersion = (teacherId: string, id: string, assignmentId: string, lifecycle: 'draft' | 'current' | 'historical'): MaterialVersionSummary => ({
  id,
  assignmentId,
  version: 1,
  lifecycle,
  pageCount: 0,
  processingState: null,
  processingCounts: { uploading: 0, queued: 0, transcribing: 0, completed: 0, failed: 0, total: 0 },
  reviewState: null,
  documentRevision: 1,
  createdAt: '2026-09-23T10:00:00.000Z',
  confirmedAt: null,
  replacedAt: null,
  readOnly: lifecycle === 'historical',
});

const savedChart = (
  teacherId: string,
  classId: string,
  id: string,
  jobExternalId: string,
  resultId: number,
  grid: Array<Array<string | null>>,
): SavedSeatingChart => ({
  id,
  classId,
  className: 'Class A',
  sourceJobExternalId: jobExternalId,
  sourceResultId: resultId,
  grid,
  studentCount: countSeated(grid),
  createdAt: '2026-09-23T10:00:00.000Z',
});

const countSeated = (grid: Array<Array<string | null>>): number =>
  grid.reduce((count, row) => count + row.filter((name) => Boolean(name?.trim())).length, 0);

/**
 * Seeded ownership map for the fake: class-1 belongs to TEACHER_A, class-b
 * to TEACHER_B; ids created by createClass (c-N) belong to the creator.
 */
const ownerOf = (classId: string, state: FakeState): string =>
  classId === 'class-1' ? TEACHER_A : classId === 'class-b' ? TEACHER_B : TEACHER_A;

interface FakeState {
  classes: ClassRecord[];
  students: StudentRecord[];
  submissions: SubmissionRecord[];
  materialVersions: MaterialVersionSummary[];
  savedCharts: SavedSeatingChart[];
  seatingJobs: Map<string, string>; // externalId -> jobId (owned by any teacher for lookup truth)
  seatingResults: Map<number, { jobId: string; arrangement: string[][] }>;
  assignmentMaxScores: Map<string, number | null>;
  submissionsAboveCount: number;
}

const buildFakeRepository = (state: FakeState): AssignmentReaderRepository => {
  const listResponse = <T>(data: T[]): ListResponse<T> => ({
    data,
    pagination: { page: 1, pageSize: 10, totalItems: data.length, totalPages: data.length === 0 ? 0 : 1 },
  });
  return {
    listClasses: ({ teacherId }) => {
      if (teacherId !== TEACHER_A && teacherId !== TEACHER_B) {
        return Promise.resolve(listResponse([]));
      }
      return Promise.resolve(listResponse(state.classes));
    },
    findClass: (teacherId, classId) => {
      const record = state.classes.find((entry) => entry.id === classId);
      const owned = record !== undefined && ownerOf(classId, state) === teacherId;
      return Promise.resolve(owned ? record : null);
    },
    createClass: (teacherId, name) =>
      Promise.resolve(classRecord(teacherId, `c-${state.classes.length + 1}`, name)),
    updateClass: (teacherId, classId, patch) => {
      const record = state.classes.find((entry) => entry.id === classId);
      if (!record) return Promise.resolve(null);
      return Promise.resolve({ ...record, ...patch, status: patch.status ?? record.status } as ClassRecord);
    },
    listStudents: ({ classId }) =>
      Promise.resolve(listResponse(state.students.filter((student) => student.classId === classId))),
    findStudent: (teacherId, studentId) =>
      Promise.resolve(state.students.find((student) => student.id === studentId) ?? null),
    createStudent: (teacherId, classId, name) =>
      Promise.resolve(studentRecord(teacherId, classId, `s-${state.students.length + 1}`, name)),
    updateStudent: (teacherId, studentId, name) => {
      const student = state.students.find((entry) => entry.id === studentId);
      return Promise.resolve(student ? { ...student, name } : null);
    },
    removeStudent: (teacherId, studentId) => {
      const student = state.students.find((entry) => entry.id === studentId);
      return Promise.resolve(student ? { ...student, status: 'removed' as const } : null);
    },
    listAssignments: ({ classId }) =>
      Promise.resolve(listResponse([])),
    findAssignment: (teacherId, assignmentId) =>
      Promise.resolve(
        (() => {
          const maxScore = state.assignmentMaxScores.get(assignmentId);
          if (maxScore === undefined) return null;
          const record: AssignmentRecord = {
            id: assignmentId,
            classId: 'class-1',
            name: 'Quiz 1',
            status: 'need_review',
            maxScore,
            createdAt: '2026-09-23T10:00:00.000Z',
            updatedAt: '2026-09-23T10:00:00.000Z',
            className: 'Class A',
            classStatus: state.classes.find((entry) => entry.id === 'class-1')?.status ?? 'active',
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
          };
          return record;
        })(),
      ),
    createAssignment: (teacherId, classId, name, maxScore) =>
      Promise.resolve({
        id: `a-${name}`,
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
    updateAssignment: (teacherId, assignmentId, patch) => {
      const maxScore = state.assignmentMaxScores.get(assignmentId);
      if (maxScore === undefined) return Promise.resolve(null);
      if (patch.maxScore !== undefined) state.assignmentMaxScores.set(assignmentId, patch.maxScore);
      return Promise.resolve({
        id: assignmentId,
        classId: 'class-1',
        name: patch.name ?? 'Quiz 1',
        status: 'need_review' as const,
        maxScore: patch.maxScore !== undefined ? patch.maxScore : maxScore,
        createdAt: '2026-09-23T10:00:00.000Z',
        updatedAt: '2026-09-23T10:00:00.000Z',
      });
    },
    countSubmissionsAboveScore: () => Promise.resolve(state.submissionsAboveCount),
    refreshAssignmentStatus: () => Promise.resolve('need_review' as const),
    listMaterialVersions: ({ assignmentId }) =>
      Promise.resolve(
        listResponse(state.materialVersions.filter((version) => version.assignmentId === assignmentId)),
      ),
    findMaterialVersion: (teacherId, materialVersionId) =>
      Promise.resolve(state.materialVersions.find((version) => version.id === materialVersionId) ?? null),
    findCurrentMaterialVersion: () => Promise.resolve(null),
    createDraftMaterialVersion: (teacherId, assignmentId) => {
      if (state.materialVersions.some((version) => version.assignmentId === assignmentId && version.lifecycle === 'draft')) {
        return Promise.resolve(null);
      }
      const version = materialVersion(teacherId, `mv-${state.materialVersions.length + 1}`, assignmentId, 'draft');
      state.materialVersions.push(version);
      return Promise.resolve(version);
    },
    findDraftMaterialVersion: (teacherId, assignmentId) =>
      Promise.resolve(
        state.materialVersions.find(
          (version) => version.assignmentId === assignmentId && version.lifecycle === 'draft',
        ) ?? null,
      ),
    listSubmissions: () => Promise.resolve(listResponse([])),
    findSubmission: (teacherId, submissionId) =>
      Promise.resolve(state.submissions.find((submission) => submission.id === submissionId) ?? null),
    createSubmission: (teacherId, assignmentId, studentId) => {
      const existing = state.submissions.find(
        (submission) => submission.assignmentId === assignmentId && submission.studentId === studentId,
      );
      if (existing) {
        return Promise.resolve({ submission: existing, created: false });
      }
      const created = submissionRecord(teacherId, `sub-${state.submissions.length + 1}`, assignmentId, studentId, 'class-1');
      state.submissions.push(created);
      return Promise.resolve({ submission: created, created: true });
    },
    listSavedSeatingCharts: (teacherId, classId) =>
      Promise.resolve(listResponse(state.savedCharts.filter((chart) => chart.classId === classId))),
    findSavedSeatingChart: (teacherId, chartId) =>
      Promise.resolve(state.savedCharts.find((chart) => chart.id === chartId) ?? null),
    findSavedSeatingChartByJob: (teacherId, classId, sourceJobExternalId) =>
      Promise.resolve(
        state.savedCharts.find(
          (chart) => chart.classId === classId && chart.sourceJobExternalId === sourceJobExternalId,
        ) ?? null,
      ),
    saveSeatingChart: (input: SaveSeatingChartInput) => {
      const existing = state.savedCharts.find(
        (chart) =>
          chart.classId === input.classId &&
          chart.sourceJobExternalId === input.sourceJobExternalId &&
          chart.sourceResultId === input.sourceResultId,
      );
      if (existing) throw new Error('Repository should be guarded by the service replay check');
      const chart = savedChart(
        input.teacherId,
        input.classId,
        `chart-${state.savedCharts.length + 1}`,
        input.sourceJobExternalId,
        input.sourceResultId,
        input.grid,
      );
      state.savedCharts.push(chart);
      return Promise.resolve(chart);
    },
    findSeatingJobByExternalId: (teacherId, externalId) => {
      const jobId = state.seatingJobs.get(externalId);
      if (!jobId) return Promise.resolve(null);
      // The fake records ownership: only TEACHER_A's jobs resolve.
      return Promise.resolve(teacherId === TEACHER_A ? { id: jobId, externalId } : null);
    },
    findSeatingResult: (jobId, resultId) => {
      const result = state.seatingResults.get(resultId);
      if (!result || result.jobId !== jobId) return Promise.resolve(null);
      return Promise.resolve({ id: resultId, arrangement: result.arrangement });
    },
    listProcessing: ({ teacherId, documentType, documentId }: {
      teacherId: string;
      documentType: string;
      documentId: string;
    }) => {
      // Only the seeded fake submission resolves; others behave as absent.
      if (teacherId === TEACHER_A && documentType === 'submission' && documentId === 'sub-1') {
        return Promise.resolve(
          listResponse([
            {
              id: 'page-1',
              documentType: 'submission' as const,
              documentId: 'sub-1',
              position: 1,
              label: 'Maya Rodriguez · Page 1',
              processingState: 'failed' as const,
              attemptCount: 2,
              queuedAt: '2026-09-23T10:01:00.000Z',
              startedAt: '2026-09-23T10:01:05.000Z',
              completedAt: null,
              uploadedAt: '2026-09-23T10:00:30.000Z',
              failure: {
                code: 'provider_timeout' as const,
                message: 'Transcription timed out; retry this page.',
                retryAllowed: true,
                replacementRecommended: false,
              },
              draftAvailable: false,
              pageRevision: 1,
              contentRevision: 0,
              reviewedContentRevision: null,
              editedByTeacher: false,
              teacherEditCount: 0,
              elapsedFromQueuedMs: 120000,
              workspacePath: null,
            },
          ]),
        );
      }
      return Promise.resolve(listResponse([]));
    },
  };
};

const buildState = (): FakeState => ({
  classes: [classRecord(TEACHER_A, 'class-1', 'Class A'), classRecord(TEACHER_B, 'class-b', 'Teacher B Class')],
  students: [studentRecord(TEACHER_A, 'class-1', 'student-1', 'Maya Rodriguez')],
  submissions: [],
  materialVersions: [],
  savedCharts: [],
  seatingJobs: new Map([['job-ext-1', 'job-1']]),
  seatingResults: new Map([[1, { jobId: 'job-1', arrangement: [['Alice', 'Bob'], [null, 'Cara']] }]]),
  assignmentMaxScores: new Map([['assignment-1', 10]]),
  submissionsAboveCount: 0,
});

const buildService = (state: FakeState) =>
  AssignmentReaderService.fromRepository(buildFakeRepository(state));

const expectError = async (promise: Promise<unknown>, status: number, code: string) => {
  try {
    await promise;
    throw new Error(`Expected ${status} ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(AssignmentReaderError);
    const readerError = error as AssignmentReaderError;
    expect(readerError.status).toBe(status);
    expect(readerError.code).toBe(code);
  }
};

describe('AssignmentReaderService — class ownership (SEC-001)', () => {
  it('returns 404 for another teacher\'s class, never 403', async () => {
    const state = buildState();
    const service = buildService(state);
    await expectError(service.getClass(TEACHER_B, 'class-1'), 404, 'RESOURCE_NOT_FOUND');
  });

  it('returns an owned class to its teacher', async () => {
    const state = buildState();
    const service = buildService(state);
    const record = await service.getClass(TEACHER_A, 'class-1');
    expect(record.id).toBe('class-1');
  });
});

describe('AssignmentReaderService — archived ancestry (REQ-021)', () => {
  it('rejects student creation under an archived class with 409', async () => {
    const state = buildState();
    state.classes[0] = classRecord(TEACHER_A, 'class-1', 'Class A', 'archived');
    const service = buildService(state);
    await expectError(
      service.createStudent(TEACHER_A, 'class-1', 'New Student'),
      409,
      'ARCHIVED_ANCESTRY',
    );
  });

  it('rejects assignment creation under an archived class', async () => {
    const state = buildState();
    state.classes[0] = classRecord(TEACHER_A, 'class-1', 'Class A', 'archived');
    const service = buildService(state);
    await expectError(
      service.createAssignment(TEACHER_A, 'class-1', 'Quiz', null),
      409,
      'ARCHIVED_ANCESTRY',
    );
  });

  it('rejects material-version creation under an archived class', async () => {
    const state = buildState();
    state.classes[0] = classRecord(TEACHER_A, 'class-1', 'Class A', 'archived');
    state.assignmentMaxScores.set('assignment-1', 10);
    const service = buildService(state);
    await expectError(
      service.createDraftMaterialVersion(TEACHER_A, 'assignment-1'),
      409,
      'ARCHIVED_ANCESTRY',
    );
  });

  it('rejects seating-chart saves into an archived class', async () => {
    const state = buildState();
    state.classes[0] = classRecord(TEACHER_A, 'class-1', 'Class A', 'archived');
    const service = buildService(state);
    await expectError(
      service.saveSeatingChartToClass(TEACHER_A, 'job-ext-1', 'class-1', 1),
      409,
      'ARCHIVED_ANCESTRY',
    );
  });
});

describe('AssignmentReaderService — draft material version idempotency (REQ-005)', () => {
  it('creates the first draft and replays it on the second call', async () => {
    const state = buildState();
    state.assignmentMaxScores.set('assignment-1', 10);
    const service = buildService(state);
    const first = await service.createDraftMaterialVersion(TEACHER_A, 'assignment-1');
    expect(first.created).toBe(true);
    expect(first.version.lifecycle).toBe('draft');
    const second = await service.createDraftMaterialVersion(TEACHER_A, 'assignment-1');
    expect(second.created).toBe(false);
    expect(second.version.id).toBe(first.version.id);
  });
});

describe('AssignmentReaderService — one submission per student (REQ-006)', () => {
  it('creates a submission once and returns the existing one on replay', async () => {
    const state = buildState();
    const service = buildService(state);
    const first = await service.createSubmission(TEACHER_A, 'assignment-1', 'student-1');
    expect(first.created).toBe(true);
    const second = await service.createSubmission(TEACHER_A, 'assignment-1', 'student-1');
    expect(second.created).toBe(false);
    expect(second.submission.id).toBe(first.submission.id);
  });

  it('rejects a student outside the assignment class with 404', async () => {
    const state = buildState();
    state.students[0] = studentRecord(TEACHER_A, 'class-b', 'student-1', 'Maya Rodriguez');
    const service = buildService(state);
    await expectError(
      service.createSubmission(TEACHER_A, 'assignment-1', 'student-1'),
      404,
      'RESOURCE_NOT_FOUND',
    );
  });

  it('rejects a removed student with 409', async () => {
    const state = buildState();
    state.students[0] = studentRecord(TEACHER_A, 'class-1', 'student-1', 'Maya Rodriguez', 'removed');
    const service = buildService(state);
    await expectError(
      service.createSubmission(TEACHER_A, 'assignment-1', 'student-1'),
      409,
      'INVALID_STATE',
    );
  });
});

describe('AssignmentReaderService — assignment maximum score (REQ-018)', () => {
  it('rejects lowering maxScore below saved submission scores with 409', async () => {
    const state = buildState();
    state.submissionsAboveCount = 2;
    const service = buildService(state);
    await expectError(
      service.updateAssignment(TEACHER_A, 'assignment-1', { maxScore: 5 }),
      409,
      'SCORE_EXCEEDS_MAXIMUM',
    );
  });

  it('accepts lowering maxScore when no saved score exceeds it', async () => {
    const state = buildState();
    state.submissionsAboveCount = 0;
    const service = buildService(state);
    const record = await service.updateAssignment(TEACHER_A, 'assignment-1', { maxScore: 5 });
    expect(record.maxScore).toBe(5);
  });
});

describe('AssignmentReaderService — save-to-class (TASK-009)', () => {
  it('copies the selected result grid into a class snapshot', async () => {
    const state = buildState();
    const service = buildService(state);
    const { chart, created } = await service.saveSeatingChartToClass(TEACHER_A, 'job-ext-1', 'class-1', 1);
    expect(created).toBe(true);
    expect(chart.sourceJobExternalId).toBe('job-ext-1');
    expect(chart.sourceResultId).toBe(1);
    expect(chart.grid).toEqual([['Alice', 'Bob'], [null, 'Cara']]);
    // Student count counts seated names only (null cells excluded).
    expect(chart.studentCount).toBe(3);
  });

  it('replays the original snapshot when saving again from the same job', async () => {
    const state = buildState();
    const service = buildService(state);
    const first = await service.saveSeatingChartToClass(TEACHER_A, 'job-ext-1', 'class-1', 1);
    const second = await service.saveSeatingChartToClass(TEACHER_A, 'job-ext-1', 'class-1', 1);
    expect(second.created).toBe(false);
    expect(second.chart.id).toBe(first.chart.id);
  });

  it('rejects another teacher\'s job with 404', async () => {
    const state = buildState();
    const service = buildService(state);
    await expectError(
      service.saveSeatingChartToClass(TEACHER_B, 'job-ext-1', 'class-b', 1),
      404,
      'RESOURCE_NOT_FOUND',
    );
  });

  it('rejects an unknown numeric result with 404', async () => {
    const state = buildState();
    const service = buildService(state);
    await expectError(
      service.saveSeatingChartToClass(TEACHER_A, 'job-ext-1', 'class-1', 99),
      404,
      'RESOURCE_NOT_FOUND',
    );
  });
});

describe('AssignmentReaderService — saved seating chart list guard (TASK-009)', () => {
  it('rejects the class chart list for another teacher\'s class with 404', async () => {
    const state = buildState();
    const service = buildService(state);
    await expectError(
      service.listSavedSeatingCharts(TEACHER_A, 'class-b', { q: undefined, sort: undefined, direction: undefined, page: undefined }),
      404,
      'RESOURCE_NOT_FOUND',
    );
  });

  it('lists charts for an owned class', async () => {
    const state = buildState();
    const service = buildService(state);
    await service.saveSeatingChartToClass(TEACHER_A, 'job-ext-1', 'class-1', 1);
    const response = await service.listSavedSeatingCharts(TEACHER_A, 'class-1', { q: undefined, sort: undefined, direction: undefined, page: undefined });
    expect(response.data).toHaveLength(1);
    expect(response.data[0].sourceJobExternalId).toBe('job-ext-1');
  });
});

describe('AssignmentReaderService — processing list ownership (TASK-008)', () => {
  const processingQuery = { q: undefined, sort: undefined, direction: undefined, page: undefined, status: undefined };

  it('lists pages for an owned submission', async () => {
    const state = buildState();
    const service = buildService(state);
    // Mint the submission through the real create flow; the fake assigns id
    // sub-1 to the first created submission.
    await service.createSubmission(TEACHER_A, 'assignment-1', 'student-1');
    const response = await service.listProcessing(TEACHER_A, 'submission', 'sub-1', processingQuery);
    expect(response.data).toHaveLength(1);
    expect(response.data[0].processingState).toBe('failed');
    expect(response.data[0].failure?.code).toBe('provider_timeout');
    expect(response.data[0].workspacePath).toBeNull();
  });

  it('rejects another teacher\'s submission with 404', async () => {
    const state = buildState();
    const service = buildService(state);
    await expectError(
      service.listProcessing(TEACHER_B, 'submission', 'sub-1', processingQuery),
      404,
      'RESOURCE_NOT_FOUND',
    );
  });

  it('rejects an unknown document id with 404', async () => {
    const state = buildState();
    const service = buildService(state);
    await expectError(
      service.listProcessing(TEACHER_A, 'materials', 'no-such-version', processingQuery),
      404,
      'RESOURCE_NOT_FOUND',
    );
  });
});

describe('AssignmentReaderService — deletion scopes (TASK-018 review fix)', () => {
  /**
   * A minimal fake standing in for the deletion-operations table: pending
   * rows are keyed by `target_id` alone (mirroring
   * `idx_deletion_operations_pending_target`, which is unique on
   * `target_id` regardless of `target_type`), so creating a second scope
   * for an id a different scope already holds throws
   * `DeletionScopeConflictError` exactly as the real repository now does.
   */
  const buildDeletionFakeRepository = (): {
    repo: AssignmentReaderRepository;
    pendingByTargetId: Map<string, DeletionOperationRow>;
  } => {
    const pendingByTargetId = new Map<string, DeletionOperationRow>();
    let nextId = 1;
    const assignment: AssignmentRecord = {
      id: 'assignment-1',
      classId: 'class-1',
      name: 'Quiz 1',
      status: 'need_review',
      maxScore: 10,
      createdAt: '2026-09-23T10:00:00.000Z',
      updatedAt: '2026-09-23T10:00:00.000Z',
      className: 'Class A',
      classStatus: 'active',
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
    };
    const repo = {
      findAssignment: (teacherId: string, assignmentId: string) =>
        Promise.resolve(teacherId === TEACHER_A && assignmentId === assignment.id ? assignment : null),
      findPendingDeletionOperation: (_teacherId: string, targetType: string, targetId: string) => {
        const existing = pendingByTargetId.get(targetId);
        return Promise.resolve(existing && existing.target_type === targetType ? existing : null);
      },
      listStorageKeysForMaterialsScope: () => Promise.resolve([]),
      listStorageKeysForAssignmentScope: () => Promise.resolve([]),
      createDeletionOperation: ({ targetType, targetId }: { targetType: string; targetId: string }) => {
        const existing = pendingByTargetId.get(targetId);
        if (existing) {
          return Promise.reject(new DeletionScopeConflictError(existing));
        }
        const row: DeletionOperationRow = {
          id: `op-${nextId++}`,
          target_type: targetType,
          target_id: targetId,
          status: 'pending',
          accepted_at_ms: Date.now(),
        };
        pendingByTargetId.set(targetId, row);
        return Promise.resolve(row);
      },
    } as unknown as AssignmentReaderRepository;
    return { repo, pendingByTargetId };
  };

  it('deleteMaterials: first call creates a pending operation; the same-scope replay returns it unchanged', async () => {
    const { repo } = buildDeletionFakeRepository();
    const service = AssignmentReaderService.fromRepository(repo);
    const first = await service.deleteMaterials(TEACHER_A, 'assignment-1');
    expect(first.created).toBe(true);
    expect(first.operation.targetType).toBe('materials');
    const second = await service.deleteMaterials(TEACHER_A, 'assignment-1');
    expect(second.created).toBe(false);
    expect(second.operation.id).toBe(first.operation.id);
  });

  it('deleteMaterials then deleteAssignment (both target the assignment\'s own id): the second, id-colliding scope surfaces 409 DELETION_ALREADY_PENDING instead of an unhandled error', async () => {
    const { repo } = buildDeletionFakeRepository();
    const service = AssignmentReaderService.fromRepository(repo);
    const materials = await service.deleteMaterials(TEACHER_A, 'assignment-1');
    expect(materials.created).toBe(true);

    await expectError(
      service.deleteAssignment(TEACHER_A, 'assignment-1'),
      409,
      'DELETION_ALREADY_PENDING',
    );
  });

  it('deleteAssignment then deleteMaterials (reverse order): still surfaces 409 DELETION_ALREADY_PENDING rather than a raw unique-violation', async () => {
    const { repo } = buildDeletionFakeRepository();
    const service = AssignmentReaderService.fromRepository(repo);
    const assignment = await service.deleteAssignment(TEACHER_A, 'assignment-1');
    expect(assignment.created).toBe(true);

    await expectError(
      service.deleteMaterials(TEACHER_A, 'assignment-1'),
      409,
      'DELETION_ALREADY_PENDING',
    );
  });
});
