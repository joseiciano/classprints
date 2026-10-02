import { z } from 'zod';
import { documentTypeSchema, failureCodeSchema, uuidSchema } from './schemas';

/**
 * Discriminated queue messages crossing the API worker → transcriber worker
 * and API worker → cleanup worker boundaries (SEC-004: idempotent queue work).
 */

export const TRANSCRIPTION_JOBS_QUEUE = 'transcription-jobs';
export const TRANSCRIPTION_JOBS_DLQ = 'transcription-jobs-dlq';
export const DOCUMENT_CLEANUP_JOBS_QUEUE = 'document-cleanup-jobs';
export const DOCUMENT_CLEANUP_JOBS_DLQ = 'document-cleanup-jobs-dlq';

/**
 * One queue message per page. `transcriptionRevision` equals the page's
 * `pageRevision` at enqueue time; stale/duplicate messages are detected by
 * comparing both fields against the current row before any write.
 */
export const transcriptionPageMessageSchema = z
  .object({
    kind: z.literal('transcription_page'),
    pageId: uuidSchema,
    transcriptionRevision: z.number().int().min(1),
    documentType: documentTypeSchema,
    attemptCount: z.number().int().min(0),
    queuedAtMs: z.number().int().min(0),
    isRetry: z.boolean(),
  })
  .strict();

/**
 * Cleanup consumer command: enumerates pending object rows for the operation
 * and deletes them in batches; replay-safe.
 */
export const deletionOperationMessageSchema = z
  .object({
    kind: z.literal('deletion_operation'),
    operationId: uuidSchema,
    targetType: z.enum([
      'page',
      'materials',
      'submission',
      'student_data',
      'assignment',
      'class',
      'account',
    ]),
  })
  .strict();

/** DLQ envelope preserving the failed message plus its failure classification. */
export const transcriptionDlqMessageSchema = z
  .object({
    kind: z.literal('transcription_dlq'),
    original: transcriptionPageMessageSchema,
    failureCode: failureCodeSchema,
    attemptsMade: z.number().int().min(0),
    lastErrorAtMs: z.number().int().min(0),
  })
  .strict();

export type TranscriptionPageMessage = z.infer<typeof transcriptionPageMessageSchema>;
export type DeletionOperationMessage = z.infer<typeof deletionOperationMessageSchema>;
export type TranscriptionDlqMessage = z.infer<typeof transcriptionDlqMessageSchema>;

/** Discriminated union accepted by the transcriber's queue consumer. */
export const transcriberQueueMessageSchema = z.discriminatedUnion('kind', [
  transcriptionPageMessageSchema,
  deletionOperationMessageSchema,
  transcriptionDlqMessageSchema,
]);

export type TranscriberQueueMessage = z.infer<typeof transcriberQueueMessageSchema>;
