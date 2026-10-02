import { z } from 'zod';
import {
  deletionOperationMessageSchema,
  transcriberQueueMessageSchema,
} from '@classprints/assignment-reader-shared';

/**
 * Required worker configuration (TASK-006/REQ-024): the model IDs come from
 * environment vars per deployment; no hardcoded teacher-visible fallback.
 * Empty values and unresolved `<VAR>` config placeholders fail the check at
 * consumer start (ASSUMPTION-003: deployment fails rather than silently
 * running with an unverified model id).
 */
export interface TranscriptionConfig {
  primaryModel: string;
  fallbackModels: string[];
}

/** Wrangler-var placeholders like `<TRANSCRIPTION_MODEL_PRODUCTION>`. */
const isConfigPlaceholder = (value: string): boolean => /^<.*>$/.test(value.trim());

export const parseTranscriptionConfig = (
  primary: string | undefined,
  fallbackCsv: string | undefined,
): TranscriptionConfig | null => {
  const primaryModel = (primary ?? '').trim();
  if (!primaryModel || isConfigPlaceholder(primaryModel)) {
    return null;
  }
  const fallbackModels = (fallbackCsv ?? '')
    .split(',')
    .map((model) => model.trim())
    .filter((model) => model.length > 0 && !isConfigPlaceholder(model));
  return { primaryModel, fallbackModels };
};

const dlqEnvelope = z.object({
  kind: z.literal('transcription_dlq'),
});

/**
 * Classifies one raw queue message body. Unknown shapes are dropped (ack)
 * rather than retried forever: they cannot ever become valid.
 */
export const classifyQueueMessage = (
  body: unknown,
): { kind: 'transcription' | 'deletion' | 'dlq' } | null => {
  const parsed = transcriberQueueMessageSchema.safeParse(body);
  if (!parsed.success) {
    return null;
  }
  if (parsed.data.kind === 'transcription_page') {
    return { kind: 'transcription' };
  }
  if (parsed.data.kind === 'deletion_operation') {
    return { kind: 'deletion' };
  }
  if (dlqEnvelope.safeParse(parsed.data).success) {
    return { kind: 'dlq' };
  }
  return null;
};

export type DeletionOperationBody = z.infer<typeof deletionOperationMessageSchema>;
