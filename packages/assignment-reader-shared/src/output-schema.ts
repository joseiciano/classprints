import { z } from 'zod';
import { decimal2Schema, uuidSchema } from './schemas';
import { assignmentDraftSchema } from './content-schema';

/**
 * Provider-boundary contract for the transcription model (REQ-012, SEC-002).
 * The model returns a schema-versioned draft plus transient question segments;
 * the worker assigns stable segment IDs and persists them through the API
 * repository. Judgments, awarded points, comments, and submission scores are
 * teacher-only: model output never carries them.
 */

/** Maximum transient key length accepted from the model. */
export const QUESTION_SEGMENT_MAX_TEXT = 20_000;
export const QUESTION_SEGMENT_MAX_KEY = 128;
export const QUESTION_SEGMENT_MAX_COUNT = 200;

const questionSegmentKeySchema = z
  .string()
  .min(1)
  .max(QUESTION_SEGMENT_MAX_KEY);

/** One parsed question row before the server assigns its stable UUID. */
export const questionSegmentInputSchema = z
  .object({
    key: questionSegmentKeySchema,
    label: z.string().max(200).nullable().optional(),
    questionText: z.string().max(QUESTION_SEGMENT_MAX_TEXT).nullable(),
    responseText: z.string().max(QUESTION_SEGMENT_MAX_TEXT).nullable(),
  })
  .strict();

export type QuestionSegmentInput = z.infer<typeof questionSegmentInputSchema>;

/** Transient model question segments with model-supplied keys. */
export const transcriptionModelOutputSchema = z
  .object({
    draft: assignmentDraftSchema,
    questionSegments: z.array(questionSegmentInputSchema).max(QUESTION_SEGMENT_MAX_COUNT),
  })
  .strict()
  .superRefine((output, ctx) => {
    const seen = new Set<string>();
    let duplicate = false;
    for (const segment of output.questionSegments) {
      if (seen.has(segment.key)) duplicate = true;
      seen.add(segment.key);
    }
    if (duplicate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Segment keys must be unique',
        path: ['questionSegments'],
      });
    }
  });

export type TranscriptionModelOutputPayload = z.infer<typeof transcriptionModelOutputSchema>;

/**
 * Stable server-side question segment as persisted per page/revision
 * (functional-spec §3). Judgment fields are teacher-owned and never appear in
 * model output; this shape is the repository boundary for queue consumers.
 */
export const questionSegmentSchema = z
  .object({
    id: uuidSchema,
    pageId: uuidSchema,
    pageRevision: z.number().int().min(1),
    ordinal: z.number().int().min(1),
    label: z.string().max(200).nullable(),
    questionText: z.string().max(QUESTION_SEGMENT_MAX_TEXT).nullable(),
    responseText: z.string().max(QUESTION_SEGMENT_MAX_TEXT).nullable(),
  })
  .strict();

export type QuestionSegmentRecord = z.infer<typeof questionSegmentSchema>;

/**
 * Teacher judgment stored separately from segments (REQ-019). Model output
 * never sets these fields; every mutation comes from an authenticated
 * teacher command.
 */
export const teacherQuestionJudgmentSchema = z
  .object({
    segmentId: uuidSchema,
    judgment: z.enum(['unmarked', 'correct', 'incorrect']),
    awardedPoints: decimal2Schema.nullable(),
    comment: z.string().max(2000).nullable(),
  })
  .strict();

export type TeacherQuestionJudgment = z.infer<typeof teacherQuestionJudgmentSchema>;

