import { z } from 'zod';
import { assignmentDraftSchema } from './content-schema';
import type {
  AssignmentStatus,
  CanonicalListQuery,
  ClassStatus,
  ProcessingState,
  SubmissionListStatus,
} from './types';

/**
 * Zod schemas for every Assignment Reader API boundary, mirroring
 * `plan/assignment-reader/api-routes/api-types.md`. Unknown request fields
 * are rejected everywhere; `CanonicalListQuery` never accepts `pageSize`.
 */

// ——— Scalars ————————————————————————————————————————————————————————————————

export const decimal2Schema = z
  .number()
  .refine((value) => Number.isFinite(value), 'Value must be a finite number')
  .refine((value) => value >= 0, 'Value must not be negative')
  .refine(
    (value) => isDecimal2(value),
    'Value accepts at most two decimal places',
  );

/**
 * True when the value carries at most two fractional digits. The tolerance
 * branch accepts float-hostile doubles such as 8.2 or 0.07 whose `v * 100`
 * lands within 1e-9 of the integer; the round-trip branch rejects genuine
 * three-decimal inputs such as 8.125.
 */
export const isDecimal2 = (value: number): boolean =>
  Number.isFinite(value) &&
  (Math.abs(value * 100 - Math.round(value * 100)) < 1e-9 ||
    Number(value.toFixed(2)) === value);

export const uuidSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    'Expected a lowercase canonical RFC 4122 UUID',
  );

export const isoDateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/,
    'Expected a UTC RFC 3339 ISO 8601 timestamp',
  )
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Expected a real calendar date');

export const shortNameSchema = (max: number) =>
  z
    .string()
    .trim()
    .min(1, 'Name cannot be empty')
    .max(max, `Name must be at most ${max} characters`);

export const searchQuerySchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().max(200, 'Search query must be at most 200 characters'));

export const pageNumberSchema = z.preprocess(
  (value) => (typeof value === 'string' ? Number(value) : value),
  z.number().int('Page must be an integer').min(1, 'Page must be at least 1'),
);

export const directionSchema = z.enum(['asc', 'desc']);

// ——— Enums ——————————————————————————————————————————————————————————————————

export const documentTypeSchema = z.enum(['materials', 'submission']);
export const processingStateSchema = z.enum([
  'uploading',
  'queued',
  'transcribing',
  'completed',
  'failed',
]);
export const reviewStateSchema = z.enum(['needs_review', 'ready_to_grade']);
export const gradingStateSchema = z.enum(['not_graded', 'graded']);
export const classStatusSchema = z.enum(['active', 'archived']);
export const studentStatusSchema = z.enum(['active', 'removed']);
export const assignmentStatusSchema = z.enum(['need_review', 'graded']);
export const failureCodeSchema = z.enum([
  'provider_timeout',
  'provider_rejected',
  'invalid_output',
  'storage_failure',
  'invalid_image',
]);
export const materialVersionLifecycleSchema = z.enum(['draft', 'current', 'historical']);
export const submissionListStatusSchema = z.enum([
  'not_started',
  'uploading',
  'queued',
  'transcribing',
  'error',
  'needs_review',
  'ready_to_grade',
  'graded',
]);
export const questionJudgmentValueSchema = z.enum(['unmarked', 'correct', 'incorrect']);
export const imageRegionReasonSchema = z.enum(['diagram', 'drawing', 'illegible', 'other']);
export const imageVariantSchema = z.enum([
  'original',
  'workspace',
  'thumbnail',
  'transcription',
  'region',
]);
export const rotationSchema = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270),
]);
export const documentActionSchema = z.enum([
  'upload_page',
  'confirm',
  'retry_page',
  'replace_page',
  'retranscribe',
  'edit_draft',
  'review_page',
  'mark_ready',
  'return_to_needs_review',
  'edit_grading',
  'edit_question_judgments',
  'mark_graded',
  'delete',
]);
export const deletionTargetTypeSchema = z.enum([
  'page',
  'materials',
  'submission',
  'student_data',
  'assignment',
  'class',
  'account',
]);
export const apiErrorCodeSchema = z.enum([
  'INVALID_REQUEST',
  'INVALID_MULTIPART',
  'UNSUPPORTED_IMAGE',
  'IMAGE_TOO_LARGE',
  'PAGE_LIMIT_EXCEEDED',
  'UNAUTHENTICATED',
  'RESOURCE_NOT_FOUND',
  'ARCHIVED_ANCESTRY',
  'HISTORICAL_VERSION_READ_ONLY',
  'INVALID_STATE',
  'REVISION_CONFLICT',
  'DUPLICATE_PAGE',
  'SCORE_EXCEEDS_MAXIMUM',
  'CONSENT_REQUIRED',
  'QUEUE_DELIVERY_FAILED',
  'DELETION_ALREADY_PENDING',
  'INTERNAL_ERROR',
]);

// ——— Envelopes ——————————————————————————————————————————————————————————————

export const paginationSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.literal(10),
  totalItems: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});

export const validationIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
});

export const errorContextSchema = z
  .object({
    currentDocumentRevision: z.number().int().min(1).optional(),
    currentPageRevision: z.number().int().min(1).optional(),
    currentContentRevision: z.number().int().min(0).optional(),
    currentQuestionPointsTotal: decimal2Schema.optional(),
  })
  .strict();

export const apiErrorResponseSchema = z
  .object({
    error: z.string(),
    code: apiErrorCodeSchema,
    details: z.array(validationIssueSchema).optional(),
    context: errorContextSchema.optional(),
  })
  .strict();

/** Builds a canonical-list query schema; `pageSize` is never accepted. */
export function canonicalListQuerySchema<Sort extends string>(
  sortValues: readonly Sort[],
): z.ZodType<CanonicalListQuery<Sort, never>, z.ZodTypeDef, unknown>;
export function canonicalListQuerySchema<Sort extends string, Status extends string>(
  sortValues: readonly Sort[],
  statusSchema: z.ZodType<Status, z.ZodTypeDef, unknown>,
): z.ZodType<CanonicalListQuery<Sort, Status>, z.ZodTypeDef, unknown>;
export function canonicalListQuerySchema<Sort extends string, Status extends string>(
  sortValues: readonly Sort[],
  statusSchema?: z.ZodType<Status, z.ZodTypeDef, unknown>,
): z.ZodType<CanonicalListQuery<Sort, Status>, z.ZodTypeDef, unknown> {
  const sortSchema = z.enum(sortValues as unknown as [Sort, ...Sort[]]);
  const base = z
    .object({
      q: searchQuerySchema.optional(),
      sort: sortSchema.optional(),
      direction: directionSchema.optional(),
      page: pageNumberSchema.optional(),
    })
    .strict();
  if (!statusSchema) {
    return base as unknown as z.ZodType<
      CanonicalListQuery<Sort, Status>,
      z.ZodTypeDef,
      unknown
    >;
  }
  return base.merge(z.object({ status: statusSchema.optional() }).strict()) as unknown as z.ZodType<
    CanonicalListQuery<Sort, Status>,
    z.ZodTypeDef,
    unknown
  >;
}

export const classListQuerySchema = canonicalListQuerySchema(
  ['createdAt', 'name', 'studentCount', 'assignmentCount', 'status'] as const,
  classStatusSchema,
);
export const studentListQuerySchema = canonicalListQuerySchema(
  ['createdAt', 'name', 'status'] as const,
  studentStatusSchema,
);
export const assignmentListQuerySchema = canonicalListQuerySchema(
  ['createdAt', 'name', 'status'] as const,
  assignmentStatusSchema,
);
export const seatingChartListQuerySchema = canonicalListQuerySchema(
  ['createdAt', 'className', 'studentCount'] as const,
);
export const submissionListQuerySchema = canonicalListQuerySchema(
  ['createdAt', 'studentName', 'status'] as const,
  submissionListStatusSchema,
);
export const processingListQuerySchema = canonicalListQuerySchema(
  ['uploadedAt', 'label', 'processingState'] as const,
  processingStateSchema,
);
export const materialVersionsPageQuerySchema = z
  .object({ page: pageNumberSchema.optional() })
  .strict();

// ——— Hierarchy ———————————————————————————————————————————————————————————————

export const createClassBodySchema = z.object({ name: shortNameSchema(120) }).strict();

export const updateClassBodySchema = z
  .object({
    name: shortNameSchema(120).optional(),
    status: z.literal('archived').optional(),
  })
  .strict()
  .refine((body) => body.name !== undefined || body.status !== undefined, {
    message: 'At least one field is required',
  });

export const createStudentBodySchema = z.object({ name: shortNameSchema(120) }).strict();

export const updateStudentBodySchema = z.object({ name: shortNameSchema(120) }).strict();

export const createAssignmentBodySchema = z
  .object({
    name: shortNameSchema(200),
    maxScore: decimal2Schema.nullable().optional(),
  })
  .strict();

export const updateAssignmentBodySchema = z
  .object({
    name: shortNameSchema(200).optional(),
    maxScore: decimal2Schema.nullable().optional(),
  })
  .strict()
  .refine((body) => body.name !== undefined || body.maxScore !== undefined, {
    message: 'At least one field is required',
  });

// ——— Seating ————————————————————————————————————————————————————————————————

export const seatingArrangementCellSchema = z.string().min(1).nullable();
export const seatingArrangementSchema = z.array(z.array(seatingArrangementCellSchema));

export const saveSeatingChartBodySchema = z
  .object({
    classId: uuidSchema,
    resultId: z.number().int().min(0),
  })
  .strict();

// ——— Documents ———————————————————————————————————————————————————————————————

export const createSubmissionBodySchema = z.object({ studentId: uuidSchema }).strict();

export const confirmDocumentBodySchema = z
  .object({
    pageIds: z.array(uuidSchema).min(1).max(20),
  })
  .strict();

export const retranscribeDocumentBodySchema = z
  .object({
    expectedDocumentRevision: z.number().int().min(1),
    confirmed: z.literal(true),
    overwriteTeacherEdits: z.boolean(),
    resetQuestionJudgments: z.boolean(),
  })
  .strict();

// ——— Images —————————————————————————————————————————————————————————————————

/** Region-only crop coordinates; validated jointly in `pageImageQuerySchema`. */
export const pageImageQuerySchema = z
  .object({
    variant: imageVariantSchema.optional(),
    rotation: rotationSchema.optional(),
    x: z.number().min(0).max(1).optional(),
    y: z.number().min(0).max(1).optional(),
    width: z.number().gt(0).max(1).optional(),
    height: z.number().gt(0).max(1).optional(),
  })
  .strict()
  .superRefine((query, ctx) => {
    const isRegion = query.variant === 'region';
    const cropKeys = ['x', 'y', 'width', 'height'] as const;
    const present = cropKeys.filter((key) => query[key] !== undefined);
    if (isRegion) {
      if (present.length !== cropKeys.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Region variant requires x, y, width, and height',
        });
        return;
      }
      const { x, y, width, height } = query as Required<
        Pick<typeof query, 'x' | 'y' | 'width' | 'height'>
      >;
      if (x + width > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'x + width must not exceed 1',
        });
      }
      if (y + height > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'y + height must not exceed 1',
        });
      }
      return;
    }
    if (present.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Crop fields are only allowed for the region variant',
      });
    }
  });

// ——— Review and grading —————————————————————————————————————————————————————

export const updatePageDraftBodySchema = z
  .object({
    draft: assignmentDraftSchema,
    expectedContentRevision: z.number().int().min(0),
  })
  .strict();

export const reviewPageBodySchema = z
  .object({ expectedContentRevision: z.number().int().min(0) })
  .strict();

export const documentRevisionCommandBodySchema = z
  .object({ expectedDocumentRevision: z.number().int().min(1) })
  .strict();

export const updateQuestionJudgmentBodySchema = z
  .object({
    expectedPageRevision: z.number().int().min(1),
    judgment: questionJudgmentValueSchema,
    awardedPoints: decimal2Schema.nullable(),
    comment: z.string().max(2000, 'Comment must be at most 2000 characters').nullable(),
  })
  .strict();

export const updateGradingDraftBodySchema = z
  .object({
    expectedDocumentRevision: z.number().int().min(1),
    score: decimal2Schema.nullable().optional(),
    comments: z.string().max(4000, 'Comments must be at most 4000 characters').nullable().optional(),
  })
  .strict()
  .refine((body) => body.score !== undefined || body.comments !== undefined, {
    message: 'At least one of score or comments is required',
  });

export const questionPointsTotalQuerySchema = z
  .object({ expectedDocumentRevision: z.number().int().min(1) })
  .strict();

export const applyQuestionPointsBodySchema = z
  .object({
    expectedDocumentRevision: z.number().int().min(1),
    expectedTotal: decimal2Schema,
    confirmed: z.literal(true),
  })
  .strict();

// ——— Analytics instrumentation (TASK-027/REQ-025) ———————————————————————————
// Review-session start/end and materials-open events. Content-free and
// identity-free by construction: no page/document/submission id, draft
// content, or student/teacher name is accepted here — the server derives
// document type from the route it is posted to and never persists this body
// beyond an aggregate Analytics Engine write (SEC-003).

export const analyticsEventBodySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('review_session_start') }).strict(),
  z
    .object({
      type: z.literal('review_session_end'),
      // Capped at 24h so a stuck tab / clock skew cannot poison aggregates.
      durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000),
    })
    .strict(),
  z.object({ type: z.literal('materials_open') }).strict(),
]);

export type AnalyticsEventBody = z.infer<typeof analyticsEventBodySchema>;

// ——— Response record schemas (outbound validation surface) ——————————————————

export const safeFailureSchema = z
  .object({
    code: failureCodeSchema,
    message: z.string(),
    retryAllowed: z.boolean(),
    replacementRecommended: z.boolean(),
  })
  .strict();

export const processingCountsSchema = z
  .object({
    uploading: z.number().int().min(0),
    queued: z.number().int().min(0),
    transcribing: z.number().int().min(0),
    completed: z.number().int().min(0),
    failed: z.number().int().min(0),
    total: z.number().int().min(0),
  })
  .strict();

export const questionJudgmentSchema = z
  .object({
    segmentId: uuidSchema,
    judgment: questionJudgmentValueSchema,
    awardedPoints: decimal2Schema.nullable(),
    comment: z.string().nullable(),
    updatedAt: isoDateTimeSchema.nullable(),
  })
  .strict();

export const dataResponseSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ data }).strict();

export const listResponseSchema = <T extends z.ZodTypeAny>(item: T) =>
  z
    .object({
      data: z.array(item),
      pagination: paginationSchema,
    })
    .strict();

export type ClassListQuery = CanonicalListQuery<
  'createdAt' | 'name' | 'studentCount' | 'assignmentCount' | 'status',
  ClassStatus
>;
export type StudentListQuery = CanonicalListQuery<
  'createdAt' | 'name' | 'status',
  z.infer<typeof studentStatusSchema>
>;
export type AssignmentListQuery = CanonicalListQuery<
  'createdAt' | 'name' | 'status',
  AssignmentStatus
>;
export type SeatingChartListQuery = CanonicalListQuery<
  'createdAt' | 'className' | 'studentCount'
>;
export type SubmissionListQuery = CanonicalListQuery<
  'createdAt' | 'studentName' | 'status',
  SubmissionListStatus
>;
export type ProcessingListQuery = CanonicalListQuery<
  'uploadedAt' | 'label' | 'processingState',
  ProcessingState
>;

