import { Hono } from 'hono';
import type { Context } from 'hono';
import type { SeatingHonoEnv } from '../types/env';
import type { AuthenticatedUser } from '@classprints/server/auth';
import { createDb } from '../lib/db';
import { createAssignmentReaderRepository } from './assignment-reader.repository';
import {
  AssignmentReaderService,
  AssignmentReaderError,
} from './assignment-reader.service';
import {
  classListQuerySchema,
  createClassBodySchema,
  updateClassBodySchema,
  studentListQuerySchema,
  createStudentBodySchema,
  updateStudentBodySchema,
  assignmentListQuerySchema,
  createAssignmentBodySchema,
  updateAssignmentBodySchema,
  materialVersionsPageQuerySchema,
  createSubmissionBodySchema,
  submissionListQuerySchema,
  seatingChartListQuerySchema,
  processingListQuerySchema,
} from '@classprints/assignment-reader-shared';
import { ZodError, z } from 'zod';
/**
 * Assignment Reader routes (TASK-007/TASK-008/TASK-009). Controllers parse
 * Zod-validated input, call the service, and map domain errors to the
 * manifest's error envelope (GUD-001). Every route requires an authenticated
 * session, applied by the parent subapp middleware.
 *
 * Cross-teacher IDs return 404 RESOURCE_NOT_FOUND exactly as specified by
 * api-manifest.md §1.1 — never a 403 that would confirm resource existence.
 */

const getUser = (c: Context<SeatingHonoEnv>): AuthenticatedUser => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (c as any).get('user') as AuthenticatedUser;
};

const documentTypeParamSchema = z.enum(['materials', 'submission']);

const createService = (c: Context<SeatingHonoEnv>): AssignmentReaderService =>
  AssignmentReaderService.fromRepository(createAssignmentReaderRepository(createDb(c.env)));

const validationIssues = (error: ZodError): Array<{ path: string; message: string }> =>
  error.issues.map((issue) => ({
    path: issue.path.join('.') || 'body',
    message: issue.message,
  }));

const handleRouteError = (error: unknown, c: Context<SeatingHonoEnv>) => {
  if (error instanceof ZodError) {
    return c.json(
      {
        error: 'Validation failed',
        code: 'INVALID_REQUEST',
        details: validationIssues(error),
      },
      400,
    );
  }
  if (error instanceof AssignmentReaderError) {
    const context = (error as AssignmentReaderError & {
      context?: Record<string, unknown>;
    }).context;
    return c.json(
      {
        error: error.message,
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
        ...(context ? { context } : {}),
      },
      error.status as 400 | 404 | 409 | 500,
    );
  }
  console.error('Unhandled assignment-reader route error', error);
  return c.json({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' }, 500);
};

/**
 * Canonical-list query parser. The strict schema rejects unknown keys, so
 * `pageSize` and any other unrecognized parameter fail with 400 rather than
 * being silently ignored (REQ-003, api-types.md §1).
 */
const parseListQuery = <T>(
  schema: { parse: (value: Record<string, unknown>) => T },
  c: Context<SeatingHonoEnv>,
): T => {
  // Forward every query parameter so the strict schema rejects unknown keys
  // such as `pageSize` with 400 (REQ-003; api-types.md §1).
  const raw = c.req.query() as Record<string, string | undefined>;
  return schema.parse({ ...raw });
};


export const registerAssignmentReaderRoutes = (app: Hono<SeatingHonoEnv>): void => {
  // ——— Classes ————————————————————————————————————————————————————————————————

  app.get('/classes', async (c) => {
    try {
      const user = getUser(c);
      const query = parseListQuery(classListQuerySchema, c);
      const result = await createService(c).listClasses(user.id, query);
      return c.json(result, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.post('/classes', async (c) => {
    try {
      const user = getUser(c);
      const body = createClassBodySchema.parse(await c.req.json());
      const record = await createService(c).createClass(user.id, body.name);
      return c.json({ data: record }, 201);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.get('/classes/:classId', async (c) => {
    try {
      const user = getUser(c);
      const record = await createService(c).getClass(user.id, c.req.param('classId'));
      return c.json({ data: record }, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.patch('/classes/:classId', async (c) => {
    try {
      const user = getUser(c);
      const body = updateClassBodySchema.parse(await c.req.json());
      const record = await createService(c).updateClass(user.id, c.req.param('classId'), body);
      return c.json({ data: record }, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  // ——— Roster students ————————————————————————————————————————————————————————

  app.get('/classes/:classId/students', async (c) => {
    try {
      const user = getUser(c);
      const query = parseListQuery(studentListQuerySchema, c);
      // Manifest §1.6 default: the roster view lists active students.
      const result = await createService(c).listStudents(user.id, c.req.param('classId'), {
        ...query,
        status: query.status ?? 'active',
      });
      return c.json(result, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.post('/classes/:classId/students', async (c) => {
    try {
      const user = getUser(c);
      const body = createStudentBodySchema.parse(await c.req.json());
      const record = await createService(c).createStudent(
        user.id,
        c.req.param('classId'),
        body.name,
      );
      return c.json({ data: record }, 201);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.patch('/classes/:classId/students/:studentId', async (c) => {
    try {
      const user = getUser(c);
      const body = updateStudentBodySchema.parse(await c.req.json());
      const record = await createService(c).updateStudent(
        user.id,
        c.req.param('classId'),
        c.req.param('studentId'),
        body.name,
      );
      return c.json({ data: record }, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.delete('/classes/:classId/students/:studentId', async (c) => {
    try {
      const user = getUser(c);
      const record = await createService(c).removeStudent(
        user.id,
        c.req.param('classId'),
        c.req.param('studentId'),
      );
      return c.json({ data: record }, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  // ——— Assignments —————————————————————————————————————————————————————————————

  app.get('/classes/:classId/assignments', async (c) => {
    try {
      const user = getUser(c);
      const query = parseListQuery(assignmentListQuerySchema, c);
      const result = await createService(c).listAssignments(user.id, c.req.param('classId'), query);
      return c.json(result, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.post('/classes/:classId/assignments', async (c) => {
    try {
      const user = getUser(c);
      const body = createAssignmentBodySchema.parse(await c.req.json());
      const record = await createService(c).createAssignment(
        user.id,
        c.req.param('classId'),
        body.name,
        body.maxScore ?? null,
      );
      return c.json({ data: record }, 201);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.get('/assignments/:assignmentId', async (c) => {
    try {
      const user = getUser(c);
      const record = await createService(c).getAssignment(user.id, c.req.param('assignmentId'));
      return c.json({ data: record }, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.patch('/assignments/:assignmentId', async (c) => {
    try {
      const user = getUser(c);
      const body = updateAssignmentBodySchema.parse(await c.req.json());
      const record = await createService(c).updateAssignment(
        user.id,
        c.req.param('assignmentId'),
        body,
      );
      return c.json({ data: record }, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  // ——— Material versions ——————————————————————————————————————————————————————

  app.get('/assignments/:assignmentId/material-versions', async (c) => {
    try {
      const user = getUser(c);
      // Version history is the explicit canonical-list exception (manifest
      // §1.5): page only, no q/sort/direction/status. The strict schema
      // rejects every other parameter with 400 (api-types.md §1).
      const query = materialVersionsPageQuerySchema.parse(c.req.query());
      const result = await createService(c).listMaterialVersions(
        user.id,
        c.req.param('assignmentId'),
        query.page ?? 1,
      );
      return c.json(result, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.post('/assignments/:assignmentId/material-versions', async (c) => {
    try {
      const user = getUser(c);
      const { version, created } = await createService(c).createDraftMaterialVersion(
        user.id,
        c.req.param('assignmentId'),
      );
      return c.json({ data: version }, created ? 201 : 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.get('/material-versions/:materialVersionId', async (c) => {
    try {
      const user = getUser(c);
      const record = await createService(c).getMaterialVersion(
        user.id,
        c.req.param('materialVersionId'),
      );
      return c.json({ data: record }, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  // ——— Submissions —————————————————————————————————————————————————————————————

  app.get('/assignments/:assignmentId/submissions', async (c) => {
    try {
      const user = getUser(c);
      const query = parseListQuery(submissionListQuerySchema, c);
      const result = await createService(c).listSubmissions(
        user.id,
        c.req.param('assignmentId'),
        query,
      );
      return c.json(result, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.get('/submissions/:submissionId', async (c) => {
    try {
      const user = getUser(c);
      const record = await createService(c).getSubmission(user.id, c.req.param('submissionId'));
      return c.json({ data: record }, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.post('/assignments/:assignmentId/submissions', async (c) => {
    try {
      const user = getUser(c);
      const body = createSubmissionBodySchema.parse(await c.req.json());
      const { submission, created } = await createService(c).createSubmission(
        user.id,
        c.req.param('assignmentId'),
        body.studentId,
      );
      return c.json({ data: { submission, created } }, created ? 201 : 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  // ——— Processing (TASK-008) ————————————————————————————————————————————————————

  app.get('/documents/:documentType/:documentId/processing', async (c) => {
    try {
      const user = getUser(c);
      const documentType = documentTypeParamSchema.parse(c.req.param('documentType'));
      const query = parseListQuery(processingListQuerySchema, c);
      const result = await createService(c).listProcessing(
        user.id,
        documentType,
        c.req.param('documentId'),
        query,
      );
      return c.json(result, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });
  // ——— Saved seating charts (TASK-009) ———————————————————————————————————————

  app.get('/classes/:classId/seating-charts', async (c) => {
    try {
      const user = getUser(c);
      const query = parseListQuery(seatingChartListQuerySchema, c);
      const result = await createService(c).listSavedSeatingCharts(
        user.id,
        c.req.param('classId'),
        query,
      );
      return c.json(result, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.get('/saved-seating-charts/:chartId', async (c) => {
    try {
      const user = getUser(c);
      const record = await createService(c).getSavedSeatingChart(user.id, c.req.param('chartId'));
      return c.json({ data: record }, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });
};
