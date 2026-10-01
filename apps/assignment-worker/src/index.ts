import type { MessageBatch } from '@cloudflare/workers-types';
import {
  transcriptionPageMessageSchema,
  type DeletionOperationMessage,
  type TranscriptionDlqMessage,
  type TranscriptionPageMessage,
} from '@classprints/assignment-reader-shared';
import type { AssignmentWorkerBindings } from './types';
import { createDb } from './lib/db';
import { DeletionRepository } from './db/deletion.repository';
import { DeletionService, type ProcessedOutcome } from './deletion/deletion.service';
import {
  handleTranscriptionMessage,
  handleTranscriptionDlqMessage,
} from './transcription/transcription.service';
import { TranscriptionRepository } from './db/transcription.repository';
import { OpenRouterRepository } from './transcription/openrouter.repository';
import {
  classifyQueueMessage,
  parseTranscriptionConfig,
} from './queue-messages';

/**
 * Assignment worker entrypoint (TASK-006). Each message is acknowledged or
 * retried explicitly so one failed vision call never redelivers an
 * acknowledged page (bounded concurrency 5 via wrangler consumer config).
 *
 * Queue routing by batch name: transcription-jobs and its DLQ carry
 * transcription envelopes; document-cleanup-jobs and its DLQ carry
 * deletion operations. Messages are content-classified as well, so a
 * misrouted message is still handled by its matching consumer.
 */
export default {
  async queue(batch: MessageBatch<unknown>, env: AssignmentWorkerBindings) {
    const queueName = getQueueName(batch);
    const isCleanupQueue =
      queueName === 'document-cleanup-jobs' || queueName === 'document-cleanup-jobs-dlq';

    if (isCleanupQueue) {
      await runCleanupBatch(batch, env);
      return;
    }
    await runTranscriptionBatch(batch, env);
  },
};

const getQueueName = (batch: MessageBatch<unknown>): string | undefined =>
  (batch as MessageBatch<unknown> & { queue?: string }).queue;

const runTranscriptionBatch = async (
  batch: MessageBatch<unknown>,
  env: AssignmentWorkerBindings,
): Promise<void> => {
  if (!parseTranscriptionConfig(env.TRANSCRIPTION_MODEL, env.TRANSCRIPTION_FALLBACK_MODELS)) {
    // Missing model configuration is a deployment error (ASSUMPTION-003);
    // each message retries until the consumer's max_retries (3) exhausts
    // and the queue drains it to the transcription DLQ — visible, not
    // silent, and never processed with a default model.
    for (const message of batch.messages) {
      console.error('transcription config missing: TRANSCRIPTION_MODEL/FALLBACK_MODELS unset');
      message.retry();
    }
    return;
  }

  const config = parseTranscriptionConfig(env.TRANSCRIPTION_MODEL, env.TRANSCRIPTION_FALLBACK_MODELS)!;
  const deps = buildTranscriptionDeps(env, config);

  for (const message of batch.messages) {
    const classified = classifyQueueMessage(message.body);
    if (classified === null) {
      message.ack(); // unknown body cannot become valid
      continue;
    }
    if (classified.kind === 'deletion') {
      // Misrouted cleanup message: handle it here rather than looping.
      await handleDeletionMessage(message.body, env, message.ack.bind(message), message.retry.bind(message));
      continue;
    }
    if (classified.kind === 'dlq') {
      // TASK-014: the DLQ handler persists the actionable failed state
      // instead of the Phase 2 ack-only passthrough.
      const outcome = await handleTranscriptionDlqMessage(message.body, deps);
      applyOutcome(message, outcome);
      continue;
    }
    const parsed = transcriptionPageMessageSchema.parse(message.body);
    const outcome = await handleTranscriptionMessage(parsed, deps);
    applyOutcome(message, outcome);
  }
};

const applyOutcome = (
  message: MessageBatch<unknown>['messages'][number],
  outcome: { handled: 'ack' | 'retry'; delaySeconds?: number },
): void => {
  if (outcome.handled === 'ack') {
    message.ack();
  } else if (outcome.delaySeconds !== undefined) {
    message.retry({ delaySeconds: outcome.delaySeconds });
  } else {
    message.retry();
  }
};

const buildTranscriptionDeps = (
  env: AssignmentWorkerBindings,
  config: { primaryModel: string; fallbackModels: string[] },
) => {
  const sql = createDb(env);
  return {
    repository: new TranscriptionRepository(sql),
    bucket: env.ASSIGNMENT_IMAGES,
    images: env.IMAGES,
    openrouter: new OpenRouterRepository(
      { apiKey: requireApiKey(env) },
      config,
      env.TRANSCRIPTION_STRUCTURED_OUTPUTS === 'true',
    ),
    primaryModel: config.primaryModel,
    analytics: env.ANALYTICS,
  };
};

const requireApiKey = (env: AssignmentWorkerBindings): string => {
  const apiKey = env.LLM_API_KEY;
  if (!apiKey) {
    // The consumer retries until the queue parks the message on the DLQ;
    // visible rather than silent, and never processed without credentials.
    throw new Error('LLM_API_KEY missing: transcription cannot run');
  }
  return apiKey;
};

const runCleanupBatch = async (
  batch: MessageBatch<unknown>,
  env: AssignmentWorkerBindings,
): Promise<void> => {
  for (const message of batch.messages) {
    await handleDeletionMessage(
      message.body,
      env,
      message.ack.bind(message),
      message.retry.bind(message),
    );
  }
};

const handleDeletionMessage = async (
  body: unknown,
  env: AssignmentWorkerBindings,
  ack: () => void,
  retry: () => void,
): Promise<void> => {
  const parsed = classifyQueueMessage(body);
  if (!parsed || parsed.kind !== 'deletion') {
    ack(); // unknown body cannot become valid
    return;
  }
  const operationId = (body as DeletionOperationMessage).operationId;
  const sql = createDb(env);
  const repository = new DeletionRepository(sql);
  const service = new DeletionService(repository, env.ASSIGNMENT_IMAGES);
  let outcome: ProcessedOutcome;
  try {
    outcome = await service.processOperation(operationId);
  } catch (error) {
    // Operational log only: IDs and outcome, never keys or content (SEC-003).
    // Error messages are collapsed to a name marker because provider/R2
    // errors can embed object keys.
    console.error('cleanup operation failed', {
      operationId,
      errorName: error instanceof Error ? error.name : 'Unknown',
    });
    retry();
    return;
  }
  if (outcome === 'no_op' || outcome === 'completed') {
    ack();
    return;
  }
  retry(); // partial failure: resume on redelivery
};

// Re-exported for tests.
export type { DeletionOperationMessage, TranscriptionPageMessage, TranscriptionDlqMessage };
