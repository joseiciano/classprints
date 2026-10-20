import type {
  AnalyticsEngineDataset,
  ImagesBinding,
  R2Bucket,
} from '@cloudflare/workers-types';
import {
  transcriptionDlqMessageSchema,
  transcriptionPageMessageSchema,
  type FailureCode,
  type TranscriptionPageMessage,
} from '@classprints/assignment-reader-shared';
import {
  InvalidOutputError,
  TranscriptionRepository,
  estimateCost,
  type AttemptAuditInput,
  type PageClaimRow,
} from '../db/transcription.repository';
import type { OpenRouterAttemptResult, OpenRouterRepository } from './openrouter.repository';

/**
 * Per-page transcription consumer (TASK-014). One message per page; the
 * consumer claims the page conditionally on the message's transcription
 * revision (SEC-004), reads the canonical R2 JPEG, bounds it to a 2048-px
 * variant through the Images binding, and calls the OpenRouter repository.
 *
 * Outcomes:
 *  - success → draft + question segments + timing + attempt audit persisted
 *    in exactly one transaction; page completed; the document enters
 *    needs_review when the last current page of a confirmed set completes.
 *  - transient provider failure (timeout/rejection) → audit row with outcome
 *    `retry`, page back to queued, delayed `message.retry()`; the queue's
 *    max_retries then parks exhausted messages on the DLQ.
 *  - terminal failure (invalid output/image, storage failure) → page failed
 *    with a safe REQ-014 code and the attempt audit row, then ack.
 *
 * Duplicate or stale deliveries are no-op acks; successful siblings are never
 * reprocessed by another page's failure. Analytics writes carry state, error
 * code, model, latency, and cost only — never content or direct identity
 * (SEC-003). Operational logs carry IDs and error names only.
 */

/** Contain-fit box for the transcription variant (api-routes-documents §2.7). */
const TRANSCRIPTION_VARIANT_BOX = 2048;
/** Delay before a transient redelivery so the provider recovers briefly. */
const TRANSIENT_RETRY_DELAY_SECONDS = 5;

export interface TranscriptionMessageDeps {
  repository: TranscriptionRepository;
  bucket: R2Bucket | undefined;
  images: ImagesBinding | undefined;
  openrouter: OpenRouterRepository;
  primaryModel: string;
  analytics: AnalyticsEngineDataset | undefined;
}

export interface TranscriptionOutcome {
  handled: 'ack' | 'retry';
  /** Delay seconds for a transient retry; undefined means immediate. */
  delaySeconds?: number;
}

export const handleTranscriptionMessage = async (
  message: TranscriptionPageMessage,
  deps: TranscriptionMessageDeps,
): Promise<TranscriptionOutcome> => {
  const claim = await deps.repository.claimPageForRevision(
    message.pageId,
    message.transcriptionRevision,
  );
  if (!claim) {
    // Stale revision (page retried/replaced/edited past this message) or
    // unknown page: acknowledge without writing (SEC-004).
    return { handled: 'ack' };
  }
  if (claim.processingState !== 'queued') {
    if (claim.processingState === 'transcribing') {
      // Orphaned execution (a worker crashed mid-flight): recover by
      // re-queueing; the conditional accept below still arbitrates.
      await deps.repository.resetToQueued(
        message.pageId,
        message.transcriptionRevision,
      );
    } else {
      // completed/failed/uploading: duplicate delivery or unconfirmed page.
      return { handled: 'ack' };
    }
  }

  const startedAtMs = Date.now();
  const accepted = await deps.repository.markTranscribing(
    message.pageId,
    message.transcriptionRevision,
    startedAtMs,
  );
  if (!accepted) {
    // Another delivery won the claim; this duplicate is redundant.
    return { handled: 'ack' };
  }

  const auditBase: Omit<AttemptAuditInput, 'model' | 'outcome' | 'failureCode' | 'endedAtMs' | 'latencyMs' | 'promptTokens' | 'completionTokens' | 'totalTokens' | 'providerCostUsd' | 'costUsd' | 'costSource'> = {
    documentType: claim.documentType,
    attempt: claim.attemptCount + 1,
    queuedAtMs: claim.queuedAtMs ?? message.queuedAtMs,
    startedAtMs,
    isRetry: message.isRetry,
  };

  // ——— Image acquisition ——————————————————————————————————————————————————
  const image = await loadTranscriptionVariant(deps, claim.storageKey);
  if (!image.ok) {
    const endedAtMs = Date.now();
    await deps.repository.persistFailure({
      pageId: message.pageId,
      transcriptionRevision: message.transcriptionRevision,
      failureCode: image.code,
      failureMessage: image.code === 'invalid_image'
        ? 'The stored page image is not a supported image; replace this page.'
        : 'The page image could not be read for transcription; replace this page.',
      audit: {
        ...auditBase,
        model: deps.primaryModel,
        outcome: 'failed',
        failureCode: image.code,
        endedAtMs,
        latencyMs: endedAtMs - startedAtMs,
        ...estimateCost(null),
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        providerCostUsd: null,
      },
      endedAtMs,
    });
    writeAnalytics(deps.analytics, {
      documentType: claim.documentType,
      outcome: 'failed',
      failureCode: image.code,
      model: deps.primaryModel,
      latencyMs: endedAtMs - startedAtMs,
      costUsd: null,
    });
    return { handled: 'ack' };
  }

  // ——— Provider call ————————————————————————————————————————————————————————
  const result = await deps.openrouter.transcribe({
    documentType: claim.documentType,
    imageJpeg: image.bytes,
    isRetry: message.isRetry,
  });
  return settleProviderResult(result, message, claim, deps, startedAtMs);
};

/** Applies one provider execution result to the page and audit trail. */
const settleProviderResult = async (
  result: OpenRouterAttemptResult,
  message: TranscriptionPageMessage,
  claim: PageClaimRow,
  deps: TranscriptionMessageDeps,
  startedAtMs: number,
): Promise<TranscriptionOutcome> => {
  const endedAtMs = Date.now();
  const latencyMs = endedAtMs - startedAtMs;
  const usage = result.usage;
  const cost = estimateCost(usage);

  if (result.outcome === 'completed') {
    const audit: AttemptAuditInput = {
      documentType: claim.documentType,
      model: result.model,
      attempt: claim.attemptCount + 1,
      queuedAtMs: claim.queuedAtMs ?? message.queuedAtMs,
      startedAtMs,
      endedAtMs,
      latencyMs,
      outcome: 'completed',
      failureCode: null,
      promptTokens: usage?.promptTokens ?? null,
      completionTokens: usage?.completionTokens ?? null,
      totalTokens: usage?.totalTokens ?? null,
      providerCostUsd: usage?.costUsd ?? null,
      costUsd: cost.costUsd,
      costSource: cost.costSource,
      isRetry: message.isRetry,
    };
    try {
      const output = result.output.data!;
      const persisted = await deps.repository.persistCompletion({
        pageId: message.pageId,
        transcriptionRevision: message.transcriptionRevision,
        materialsVersionId: claim.materialsVersionId,
        submissionId: claim.submissionId,
        startedAtMs,
        completedAtMs: endedAtMs,
        draft: output.draft,
        segments: output.questionSegments,
        audit,
      });
      if (persisted === 'stale') {
        // The page moved on (retry/replacement/teacher action) between the
        // claim and persistence; keep the accepted attempt queryable.
        await deps.repository.recordAuditOnly(
          audit,
          message.pageId,
          message.transcriptionRevision,
          endedAtMs,
        );
      }
    } catch (error) {
      if (error instanceof InvalidOutputError) {
        // The persistence-boundary validator rejected the draft: terminal
        // invalid_output (REQ-014); nothing was persisted by the transaction.
        await deps.repository.persistFailure({
          pageId: message.pageId,
          transcriptionRevision: message.transcriptionRevision,
          failureCode: 'invalid_output',
          failureMessage: 'Transcription output was invalid; retry this page.',
          audit: { ...audit, outcome: 'failed', failureCode: 'invalid_output' },
          endedAtMs,
        });
        writeAnalytics(deps.analytics, {
          documentType: claim.documentType,
          outcome: 'failed',
          failureCode: 'invalid_output',
          model: result.model,
          latencyMs,
          costUsd: cost.costUsd,
        });
        return { handled: 'ack' };
      }
      // Storage/database failure during persistence: retry the message; the
      // conditional claim arbitrates against whatever state exists then.
      console.error('transcription persistence failed', {
        pageId: message.pageId,
        errorName: error instanceof Error ? error.name : 'Unknown',
      });
      return { handled: 'retry' };
    }
    writeAnalytics(deps.analytics, {
      documentType: claim.documentType,
      outcome: 'completed',
      failureCode: null,
      model: result.model,
      latencyMs,
      costUsd: cost.costUsd,
    });
    return { handled: 'ack' };
  }

  // ——— Failed execution —————————————————————————————————————————————————————
  const failure = result.failure;
  const audit: AttemptAuditInput = {
    documentType: claim.documentType,
    model: result.model,
    attempt: claim.attemptCount + 1,
    queuedAtMs: claim.queuedAtMs ?? message.queuedAtMs,
    startedAtMs,
    endedAtMs,
    latencyMs,
    outcome: failure.code === 'invalid_output' ? 'failed' : 'retry',
    failureCode: failure.code,
    promptTokens: usage?.promptTokens ?? null,
    completionTokens: usage?.completionTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
    providerCostUsd: usage?.costUsd ?? null,
    costUsd: cost.costUsd,
    costSource: cost.costSource,
    isRetry: message.isRetry,
  };

  if (failure.code === 'invalid_output') {
    // Terminal exhaustion: record the failed state and ack (REQ-013/REQ-014).
    await deps.repository.persistFailure({
      pageId: message.pageId,
      transcriptionRevision: message.transcriptionRevision,
      failureCode: 'invalid_output',
      failureMessage: 'Transcription output was invalid; retry this page.',
      audit,
      endedAtMs,
    });
    writeAnalytics(deps.analytics, {
      documentType: claim.documentType,
      outcome: 'failed',
      failureCode: 'invalid_output',
      model: result.model,
      latencyMs,
      costUsd: cost.costUsd,
    });
    return { handled: 'ack' };
  }

  // Transient provider timeout/rejection: audit row `retry`, page back to
  // queued, delayed message retry; the queue parks exhausted messages on the
  // DLQ where the DLQ handler records the actionable failed state.
  await deps.repository.recordAuditOnly(
    audit,
    message.pageId,
    message.transcriptionRevision,
    endedAtMs,
  );
  await deps.repository.resetToQueued(
    message.pageId,
    message.transcriptionRevision,
  );
  writeAnalytics(deps.analytics, {
    documentType: claim.documentType,
    outcome: 'retry',
    failureCode: failure.code,
    model: result.model,
    latencyMs,
    costUsd: cost.costUsd,
  });
  return { handled: 'retry', delaySeconds: TRANSIENT_RETRY_DELAY_SECONDS };
};

// ——— DLQ handling (TASK-014 review note) —————————————————————————————————————

/**
 * Replaces the Phase 2 ack-only DLQ placeholder. The transcription DLQ
 * receives two shapes: raw page messages auto-moved after the queue's
 * retries exhaust, and `transcription_dlq` envelopes from producers. Both
 * must leave an actionable failed page state; superseded revisions are
 * no-ops (their terminal state stands).
 */
export const handleTranscriptionDlqMessage = async (
  body: unknown,
  deps: TranscriptionMessageDeps,
): Promise<TranscriptionOutcome> => {
  const envelope = transcriptionDlqMessageSchema.safeParse(body);
  if (envelope.success) {
    const { original, failureCode } = envelope.data;
    await deps.repository.persistDlqFailure({
      pageId: original.pageId,
      transcriptionRevision: original.transcriptionRevision,
      failureCode,
      nowMs: Date.now(),
    });
    return { handled: 'ack' };
  }
  const page = transcriptionPageMessageSchema.safeParse(body);
  if (page.success) {
    // Auto-moved raw message: classify from the audit trail; exhausted
    // transient retries default to provider_timeout.
    const failureCode =
      (await deps.repository.latestAttemptFailureCode(
        page.data.pageId,
        page.data.transcriptionRevision,
      )) ?? 'provider_timeout';
    await deps.repository.persistDlqFailure({
      pageId: page.data.pageId,
      transcriptionRevision: page.data.transcriptionRevision,
      failureCode,
      nowMs: Date.now(),
    });
    return { handled: 'ack' };
  }
  return { handled: 'ack' }; // unknown shape: cannot become valid
};

// ——— R2/Images access (bounded transcription variant) ————————————————————————

type ImageLoad =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; code: 'storage_failure' | 'invalid_image' };

const loadTranscriptionVariant = async (
  deps: TranscriptionMessageDeps,
  storageKey: string,
): Promise<ImageLoad> => {
  if (!deps.bucket || !deps.images) {
    return { ok: false, code: 'storage_failure' };
  }
  let canonical: Uint8Array;
  try {
    const object = await deps.bucket.get(storageKey);
    if (!object) {
      return { ok: false, code: 'storage_failure' };
    }
    canonical = await readAll(object.body);
  } catch {
    return { ok: false, code: 'storage_failure' };
  }
  try {
    // Never upscale; contain within 2048 px and re-encode JPEG so the
    // base64 request body stays bounded (functional-spec §6, RISK-008).
    const transformer = deps.images
      .input(streamOf(canonical))
      .transform({ width: TRANSCRIPTION_VARIANT_BOX, height: TRANSCRIPTION_VARIANT_BOX, fit: 'scale-down' });
    const output = await transformer.output({ format: 'image/jpeg', quality: 90 });
    const bytes = await readAll(output.image());
    if (bytes.byteLength === 0) {
      return { ok: false, code: 'invalid_image' };
    }
    return { ok: true, bytes };
  } catch {
    return { ok: false, code: 'invalid_image' };
  }
};

type ByteStream = Parameters<ImagesBinding['input']>[0];

const streamOf = (bytes: Uint8Array): ByteStream => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Response(copy).body as ByteStream;
};

const readAll = async (
  stream: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> } },
): Promise<Uint8Array> => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done || chunk.value === undefined) break;
    chunks.push(chunk.value);
    size += chunk.value.byteLength;
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
};

// ——— Analytics (SEC-003: no content, no direct identity) —————————————————————

interface AnalyticsEvent {
  documentType: string;
  outcome: string;
  failureCode: FailureCode | null;
  model: string;
  latencyMs: number;
  costUsd: number | null;
}

const writeAnalytics = (
  analytics: AnalyticsEngineDataset | undefined,
  event: AnalyticsEvent,
): void => {
  if (!analytics) return;
  try {
    analytics.writeDataPoint({
      indexes: [event.outcome],
      blobs: [event.documentType, event.failureCode ?? '', event.model],
      doubles: [event.latencyMs, event.costUsd ?? -1],
    });
  } catch {
    // Metrics must never break processing.
  }
};
