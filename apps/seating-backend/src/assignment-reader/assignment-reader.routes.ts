import { Hono } from 'hono';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { SeatingHonoEnv } from '../types/env';
import type { AuthenticatedUser } from '@classprints/server/auth';
import { createDb } from '../lib/db';
import { createAssignmentReaderRepository } from './assignment-reader.repository';
import {
  AssignmentReaderService,
  AssignmentReaderError,
  type AssignmentReaderQueues,
} from './assignment-reader.service';
import { createPageImageRepository, MAX_UPLOAD_BYTES } from './page-image.repository';
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
  confirmDocumentBodySchema,
  retranscribeDocumentBodySchema,
  pageImageQuerySchema,
  updatePageDraftBodySchema,
  reviewPageBodySchema,
  documentRevisionCommandBodySchema,
  updateQuestionJudgmentBodySchema,
  updateGradingDraftBodySchema,
  questionPointsTotalQuerySchema,
  applyQuestionPointsBodySchema,
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

/** Wires the DB repository plus the R2/Images and queue bindings (TASK-010/
 * TASK-011/TASK-012); every pre-existing hierarchy/list route only ever
 * touches `repo`, so this stays a drop-in replacement for the old
 * `AssignmentReaderService.fromRepository(...)` factory. */
const createService = (c: Context<SeatingHonoEnv>): AssignmentReaderService => {
  const repo = createAssignmentReaderRepository(createDb(c.env));
  const images = createPageImageRepository(c.env.ASSIGNMENT_IMAGES, c.env.IMAGES);
  const queues: AssignmentReaderQueues = {
    sendTranscriptionPage: async (message) => {
      await c.env.TRANSCRIPTION_JOBS.send(message);
    },
    sendDeletionOperation: async (message) => {
      await c.env.DOCUMENT_CLEANUP_JOBS.send(message);
    },
  };
  return new AssignmentReaderService({ repo, images, queues });
};

/** Extracts the single required `file` field from a multipart upload
 * (api-routes-documents.md §2.1/§2.2/§2.3). `bodyLimit` on the route already
 * bounds the total request size; this only shapes the field itself. */
const extractUploadFile = async (c: Context<SeatingHonoEnv>): Promise<ArrayBuffer> => {
  let body: Record<string, string | File | (string | File)[]>;
  try {
    body = await c.req.parseBody({ all: true });
  } catch {
    throw new AssignmentReaderError(400, 'INVALID_MULTIPART', 'Expected multipart/form-data');
  }
  const field = body['file'];
  const file = Array.isArray(field) ? (field.length === 1 ? field[0] : undefined) : field;
  if (!(file instanceof File) || file.size === 0) {
    throw new AssignmentReaderError(
      400,
      'INVALID_MULTIPART',
      'Exactly one non-empty "file" field is required',
    );
  }
  return file.arrayBuffer();
};

const uploadBodyLimit = () =>
  bodyLimit({
    // Headroom above the 10 MB business rule for multipart framing/headers;
    // the service re-checks the exact byte budget on the parsed field.
    maxSize: MAX_UPLOAD_BYTES + 65_536,
    onError: (c) =>
      c.json(
        { error: 'Image exceeds the 10 MB limit', code: 'IMAGE_TOO_LARGE' },
        413,
      ),
  });

/** Parses the image-delivery query: raw query-string values are strings, so
 * numeric fields are coerced before the strict Zod schema (which expects
 * real numbers/literals) validates them. */
const parsePageImageQuery = (c: Context<SeatingHonoEnv>) => {
  const raw = c.req.query() as Record<string, string | undefined>;
  const toNumber = (value: string | undefined): number | undefined =>
    value === undefined ? undefined : Number(value);
  return pageImageQuerySchema.parse({
    variant: raw.variant,
    rotation: toNumber(raw.rotation),
    x: toNumber(raw.x),
    y: toNumber(raw.y),
    width: toNumber(raw.width),
    height: toNumber(raw.height),
  });
};

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

  // ——— Page upload, ordering, replacement, removal, delivery (TASK-010/011/012) ———

  app.post(
    '/material-versions/:materialVersionId/pages',
    uploadBodyLimit(),
    async (c) => {
      try {
        const user = getUser(c);
        const bytes = await extractUploadFile(c);
        const page = await createService(c).uploadPage(
          user.id,
          'materials',
          c.req.param('materialVersionId'),
          bytes,
        );
        return c.json({ data: page }, 201);
      } catch (error) {
        return handleRouteError(error, c);
      }
    },
  );

  app.post(
    '/submissions/:submissionId/pages',
    uploadBodyLimit(),
    async (c) => {
      try {
        const user = getUser(c);
        const bytes = await extractUploadFile(c);
        const page = await createService(c).uploadPage(
          user.id,
          'submission',
          c.req.param('submissionId'),
          bytes,
        );
        return c.json({ data: page }, 201);
      } catch (error) {
        return handleRouteError(error, c);
      }
    },
  );

  app.post('/pages/:pageId/replace', uploadBodyLimit(), async (c) => {
    try {
      const user = getUser(c);
      const bytes = await extractUploadFile(c);
      const result = await createService(c).replacePage(user.id, c.req.param('pageId'), bytes);
      return c.json({ data: result }, 201);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.delete('/pages/:pageId', async (c) => {
    try {
      const user = getUser(c);
      const { operation, created } = await createService(c).removePage(user.id, c.req.param('pageId'));
      return c.json({ data: operation }, created ? 202 : 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.post('/documents/:documentType/:documentId/confirm', async (c) => {
    try {
      const user = getUser(c);
      const documentType = documentTypeParamSchema.parse(c.req.param('documentType'));
      const body = confirmDocumentBodySchema.parse(await c.req.json());
      const result = await createService(c).confirmDocument(
        user.id,
        documentType,
        c.req.param('documentId'),
        body.pageIds,
      );
      return c.json({ data: result }, 202);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.post('/documents/:documentType/:documentId/retry-confirm', async (c) => {
    try {
      const user = getUser(c);
      const documentType = documentTypeParamSchema.parse(c.req.param('documentType'));
      const result = await createService(c).retryConfirmDocument(
        user.id,
        documentType,
        c.req.param('documentId'),
      );
      return c.json({ data: result }, 202);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  // ——— Retry and retranscription (TASK-015) ——————————————————————————————————

  app.post('/pages/:pageId/retry', async (c) => {
    try {
      const user = getUser(c);
      const result = await createService(c).retryPage(user.id, c.req.param('pageId'));
      return c.json({ data: result }, 202);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.post('/documents/:documentType/:documentId/retranscribe', async (c) => {
    try {
      const user = getUser(c);
      const documentType = documentTypeParamSchema.parse(c.req.param('documentType'));
      const body = retranscribeDocumentBodySchema.parse(await c.req.json());
      const result = await createService(c).retranscribeDocument(
        user.id,
        documentType,
        c.req.param('documentId'),
        body,
      );
      return c.json({ data: result }, 202);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.get('/pages/:pageId/image', async (c) => {
    try {
      const user = getUser(c);
      const query = parsePageImageQuery(c);
      const variant = query.variant ?? 'workspace';
      const rotation = query.rotation ?? 0;
      const region =
        variant === 'region' && query.x !== undefined && query.y !== undefined
          && query.width !== undefined && query.height !== undefined
          ? { x: query.x, y: query.y, width: query.width, height: query.height }
          : null;
      const { stream, contentType } = await createService(c).getPageImage(
        user.id,
        c.req.param('pageId'),
        variant,
        rotation,
        region,
      );
      // `stream` is a real Workers ReadableStream; only the ambient dom-lib
      // vs @cloudflare/workers-types declarations disagree structurally.
      return new Response(stream as unknown as ReadableStream<Uint8Array>, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'X-Content-Type-Options': 'nosniff',
          // Browser-safe private caching: never a shared/CDN cache (manifest
          // SEC-001 — image bytes are per-teacher authenticated content).
          'Cache-Control': 'private, max-age=300, must-revalidate',
        },
      });
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

  // ——— Document aggregate rollup ——————————————————————————————————————————————

  app.get('/documents/:documentType/:documentId', async (c) => {
    try {
      const user = getUser(c);
      const documentType = documentTypeParamSchema.parse(c.req.param('documentType'));
      const result = await createService(c).getDocumentAggregate(
        user.id,
        documentType,
        c.req.param('documentId'),
      );
      return c.json({ data: result }, 200);
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

  // ——— Workspace, draft editing, and page review (TASK-016) ——————————————————

  app.get('/documents/:documentType/:documentId/workspace', async (c) => {
    try {
      const user = getUser(c);
      const documentType = documentTypeParamSchema.parse(c.req.param('documentType'));
      const result = await createService(c).getWorkspace(user.id, documentType, c.req.param('documentId'));
      return c.json({ data: result }, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.get('/pages/:pageId', async (c) => {
    try {
      const user = getUser(c);
      const result = await createService(c).getPageWorkspace(user.id, c.req.param('pageId'));
      return c.json({ data: result }, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.patch('/pages/:pageId/draft', async (c) => {
    try {
      const user = getUser(c);
      const body = updatePageDraftBodySchema.parse(await c.req.json());
      const result = await createService(c).updatePageDraft(user.id, c.req.param('pageId'), body);
      return c.json({ data: result }, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.post('/pages/:pageId/review', async (c) => {
    try {
      const user = getUser(c);
      const body = reviewPageBodySchema.parse(await c.req.json());
      const result = await createService(c).reviewPage(user.id, c.req.param('pageId'), body);
      return c.json({ data: result }, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.post('/documents/:documentType/:documentId/mark-ready', async (c) => {
    try {
      const user = getUser(c);
      const documentType = documentTypeParamSchema.parse(c.req.param('documentType'));
      const body = documentRevisionCommandBodySchema.parse(await c.req.json());
      const result = await createService(c).markDocumentReady(
        user.id,
        documentType,
        c.req.param('documentId'),
        body,
      );
      return c.json({ data: result }, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.post('/documents/:documentType/:documentId/return-to-needs-review', async (c) => {
    try {
      const user = getUser(c);
      const documentType = documentTypeParamSchema.parse(c.req.param('documentType'));
      const body = documentRevisionCommandBodySchema.parse(await c.req.json());
      const result = await createService(c).returnToNeedsReview(
        user.id,
        documentType,
        c.req.param('documentId'),
        body,
      );
      return c.json({ data: result }, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  // ——— Question judgments and grading (TASK-017) ——————————————————————————————

  app.put('/pages/:pageId/question-segments/:segmentId/judgment', async (c) => {
    try {
      const user = getUser(c);
      const body = updateQuestionJudgmentBodySchema.parse(await c.req.json());
      const result = await createService(c).updateQuestionJudgment(
        user.id,
        c.req.param('pageId'),
        c.req.param('segmentId'),
        body,
      );
      return c.json({ data: result }, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.patch('/submissions/:submissionId/grading', async (c) => {
    try {
      const user = getUser(c);
      const body = updateGradingDraftBodySchema.parse(await c.req.json());
      const result = await createService(c).updateGradingDraft(user.id, c.req.param('submissionId'), body);
      return c.json({ data: result }, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.get('/submissions/:submissionId/question-points-total', async (c) => {
    try {
      const user = getUser(c);
      const raw = c.req.query('expectedDocumentRevision');
      const query = questionPointsTotalQuerySchema.parse({
        expectedDocumentRevision: raw === undefined ? undefined : Number(raw),
      });
      const result = await createService(c).getQuestionPointsTotal(
        user.id,
        c.req.param('submissionId'),
        query,
      );
      return c.json({ data: result }, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.post('/submissions/:submissionId/apply-question-points-to-score', async (c) => {
    try {
      const user = getUser(c);
      const body = applyQuestionPointsBodySchema.parse(await c.req.json());
      const result = await createService(c).applyQuestionPointsToScore(
        user.id,
        c.req.param('submissionId'),
        body,
      );
      return c.json({ data: result }, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.post('/submissions/:submissionId/mark-graded', async (c) => {
    try {
      const user = getUser(c);
      const body = documentRevisionCommandBodySchema.parse(await c.req.json());
      const result = await createService(c).markSubmissionGraded(user.id, c.req.param('submissionId'), body);
      return c.json({ data: result }, 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  // ——— Deletion (TASK-018) ————————————————————————————————————————————————————

  app.delete('/classes/:classId', async (c) => {
    try {
      const user = getUser(c);
      const { operation, created } = await createService(c).deleteClass(user.id, c.req.param('classId'));
      return c.json({ data: operation }, created ? 202 : 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.delete('/classes/:classId/students/:studentId/data', async (c) => {
    try {
      const user = getUser(c);
      const { operation, created } = await createService(c).deleteStudentData(
        user.id,
        c.req.param('classId'),
        c.req.param('studentId'),
      );
      return c.json({ data: operation }, created ? 202 : 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.delete('/assignments/:assignmentId', async (c) => {
    try {
      const user = getUser(c);
      const { operation, created } = await createService(c).deleteAssignment(
        user.id,
        c.req.param('assignmentId'),
      );
      return c.json({ data: operation }, created ? 202 : 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.delete('/assignments/:assignmentId/materials', async (c) => {
    try {
      const user = getUser(c);
      const { operation, created } = await createService(c).deleteMaterials(
        user.id,
        c.req.param('assignmentId'),
      );
      return c.json({ data: operation }, created ? 202 : 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });

  app.delete('/submissions/:submissionId', async (c) => {
    try {
      const user = getUser(c);
      const { operation, created } = await createService(c).deleteSubmission(
        user.id,
        c.req.param('submissionId'),
      );
      return c.json({ data: operation }, created ? 202 : 200);
    } catch (error) {
      return handleRouteError(error, c);
    }
  });
};
