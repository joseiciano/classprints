import { describe, expect, it, vi } from 'vitest';
import type { ImagesBinding, R2Bucket } from '@cloudflare/workers-types';
import type { TranscriptionPageMessage } from '@classprints/assignment-reader-shared';
import {
  dedupeRegionIds,
  estimateCost,
  TranscriptionRepository,
} from '../src/db/transcription.repository';
import {
  OpenRouterRepository,
} from '../src/transcription/openrouter.repository';
import { extractJsonObject } from '../src/transcription/json';
import { validateModelOutput } from '../src/transcription/output-validator';
import {
  buildSystemPrompt,
  buildUserPrompt,
  TRANSCRIPTION_OUTPUT_JSON_SCHEMA,
} from '../src/transcription/prompt';
import {
  handleTranscriptionDlqMessage,
  handleTranscriptionMessage,
  type TranscriptionMessageDeps,
} from '../src/transcription/transcription.service';

/**
 * Transcriber contract tests (TEST-005, TASK-013/TASK-014): model-output
 * validation through both response paths, invalid-output exhaustion,
 * timeout classification, stale/duplicate acknowledgement, per-page
 * isolation, segment supersession semantics, cost estimates, and the DLQ
 * failed-state persistence that replaces the Phase 2 ack-only placeholder.
 * Postgres access is faked at the repository methods the service calls;
 * the SQL itself is exercised by the shared-schema and migration suites.
 */

const PAGE_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const UUID_B = 'bbbbbbbb-1111-4111-8111-111111111111';

const pageMessage = (overrides: Partial<TranscriptionPageMessage> = {}): TranscriptionPageMessage => ({
  kind: 'transcription_page',
  pageId: PAGE_ID,
  transcriptionRevision: 1,
  documentType: 'submission',
  attemptCount: 0,
  queuedAtMs: 1_700_000_000_000,
  isRetry: false,
  ...overrides,
});

const claim = (overrides: Partial<Parameters<typeof repoOver>[0]['claim']> = {}) => ({
  id: PAGE_ID,
  storageKey: `teacher/t/class/c/assignment/a/submission/${PAGE_ID}.jpg`,
  documentType: 'submission' as const,
  materialsVersionId: null,
  submissionId: UUID_B,
  pageRevision: 1,
  processingState: 'queued' as const,
  attemptCount: 0,
  queuedAtMs: 1_700_000_000_000,
  ...overrides,
});

const validModelPayload = () => ({
  draft: {
    schemaVersion: 1 as const,
    doc: {
      type: 'doc' as const,
      content: [
        {
          type: 'paragraph' as const,
          content: [{ type: 'text' as const, text: '2 + 2 = 4' }],
        },
      ],
    },
  },
  questionSegments: [
    { key: 'q1', label: null, questionText: 'What is 2+2?', responseText: '4' },
  ],
});

// ——— TASK-013: output validator ———————————————————————————————————————————————

describe('TASK-013 output validator (REQ-012, SEC-002)', () => {
  it('accepts a schema-versioned draft with question segments', () => {
    const validation = validateModelOutput(validModelPayload());
    expect(validation.ok).toBe(true);
    expect(validation.data?.draft.schemaVersion).toBe(1);
    expect(validation.data?.questionSegments[0]!.key).toBe('q1');
  });

  it('rejects unknown nodes, marks, and extra fields', () => {
    const payload = {
      draft: {
        schemaVersion: 1,
        doc: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'strike' }] }] },
          ],
        },
      },
      questionSegments: [],
    };
    expect(validateModelOutput(payload).ok).toBe(false);
    expect(validateModelOutput({ ...validModelPayload(), extra: true }).ok).toBe(false);
    expect(validateModelOutput({ draft: validModelPayload().draft }).ok).toBe(false);
  });

  it('rejects model-supplied grading fields', () => {
    const payload = {
      ...validModelPayload(),
      questionSegments: [
        { key: 'q1', questionText: 'q', responseText: 'a', judgment: 'correct' },
      ],
    };
    expect(validateModelOutput(payload).ok).toBe(false);
  });

  it('rejects out-of-bounds imageRegion coordinates and duplicate keys', () => {
    const region = (x: number, width: number) => ({
      type: 'imageRegion',
      attrs: { regionId: UUID_B, x, y: 0, width, height: 0.5, reason: 'diagram' },
    });
    expect(validateModelOutput({
      draft: { schemaVersion: 1, doc: { type: 'doc', content: [region(0.5, 0.6)] } },
      questionSegments: [],
    }).ok).toBe(false);
    expect(validateModelOutput({
      ...validModelPayload(),
      questionSegments: [
        { key: 'q1', questionText: null, responseText: null },
        { key: 'q1', questionText: null, responseText: null },
      ],
    }).ok).toBe(false);
  });

  it('rejects oversized LaTeX beyond the shared bound', () => {
    const latex = 'x'.repeat(4097);
    expect(validateModelOutput({
      draft: {
        schemaVersion: 1,
        doc: { type: 'doc', content: [{ type: 'blockMath', attrs: { latex } }] },
      },
      questionSegments: [],
    }).ok).toBe(false);
  });
});

describe('TASK-013 prompt contract', () => {
  it('declares image text untrusted and never follows it (SEC-002)', () => {
    const system = buildSystemPrompt();
    expect(system).toMatch(/data to transcribe/i);
    expect(system).toMatch(/not instructions/i);
  });

  it('summarizes validation issues into the next attempt without content', () => {
    const user = buildUserPrompt('materials', ['draft.doc: unknown node']);
    expect(user).toMatch(/rejected for these reasons/);
    expect(user).toContain('draft.doc: unknown node');
  });

  it('mirrors the shared contract in the structured-output schema', () => {
    expect(TRANSCRIPTION_OUTPUT_JSON_SCHEMA.required).toContain('questionSegments');
    expect(TRANSCRIPTION_OUTPUT_JSON_SCHEMA.properties.draft.properties.schemaVersion).toEqual({ const: 1 });
  });
});

// ——— TASK-013: OpenRouter repository paths ———————————————————————————————————

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

const providerResponse = (content: string, usage?: Record<string, number>): Response =>
  jsonResponse({
    choices: [{ message: { content } }],
    ...(usage ? { usage } : {}),
  });

const openrouterOver = (
  responses: Array<Response | Error>,
  capture: { payloads?: unknown[] } = {},
): OpenRouterRepository => {
  capture.payloads = capture.payloads ?? [];
  return new OpenRouterRepository(
    {
      apiKey: 'test-key',
      fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
        capture.payloads?.push(JSON.parse(String(init?.body)));
        const next = responses.shift();
        if (next instanceof Error) throw next;
        return next ?? jsonResponse({ choices: [] });
      }) as unknown as typeof fetch,
    },
    { primaryModel: 'm/primary', fallbackModels: ['m/fallback'] },
    true,
  );
};

describe('TASK-013 OpenRouter repository (both response paths)', () => {
  it('parses valid structured output and reports provider usage/cost', async () => {
    const capture: { payloads?: unknown[] } = {};
    const repo = openrouterOver(
      [providerResponse(JSON.stringify(validModelPayload()), { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, cost: 0.01 })],
      capture,
    );
    const result = await repo.transcribe({
      documentType: 'submission',
      imageJpeg: new Uint8Array([1, 2, 3]),
      isRetry: false,
    });
    expect(result.outcome).toBe('completed');
    expect(result.usage?.costUsd).toBe(0.01);
    expect(result.model).toBe('m/primary');
    // Native path: json_schema + require_parameters, text part before image.
    const payload = capture.payloads![0] as Record<string, unknown>;
    expect((payload.response_format as Record<string, unknown>).type).toBe('json_schema');
    expect((payload.provider as Record<string, unknown>).require_parameters).toBe(true);
    const userContent = (payload.messages as Array<{ content: unknown }>)[1]!.content as Array<{ type: string }>;
    expect(userContent[0]!.type).toBe('text');
    expect(userContent[1]!.type).toBe('image_url');
  });

  it('falls back through the model sequence and feeds validation issues back', async () => {
    const capture: { payloads?: unknown[] } = {};
    const repo = openrouterOver(
      [
        providerResponse(JSON.stringify({ draft: { nope: true }, questionSegments: [] })),
        providerResponse(JSON.stringify(validModelPayload())),
      ],
      capture,
    );
    const result = await repo.transcribe({
      documentType: 'materials',
      imageJpeg: new Uint8Array([1]),
      isRetry: false,
    });
    expect(result.outcome).toBe('completed');
    expect(result.model).toBe('m/primary');
    const second = capture.payloads![1] as { messages: Array<{ content: unknown }> };
    expect(JSON.stringify(second.messages[1]!.content)).toMatch(/rejected for these reasons/);
  });

  it('classifies a timeout as provider_timeout and a rejection as provider_rejected', async () => {
    const abort = openrouterOver([new DOMException('aborted', 'AbortError')]);
    const aborted = await abort.transcribe({
      documentType: 'submission',
      imageJpeg: new Uint8Array([1]),
      isRetry: false,
    });
    expect(aborted.outcome).toBe('failed');
    expect(aborted.failure.code).toBe('provider_timeout');

    const rejected = openrouterOver([jsonResponse({ error: 'no' }, 401)]);
    const rejectedResult = await rejected.transcribe({
      documentType: 'submission',
      imageJpeg: new Uint8Array([1]),
      isRetry: false,
    });
    expect(rejectedResult.outcome).toBe('failed');
    expect(rejectedResult.failure.code).toBe('provider_rejected');
  });

  it('exhausts invalid output across the model sequence and reports invalid_output', async () => {
    const repo = openrouterOver([
      providerResponse('not json at all'),
      providerResponse('still not json'),
      providerResponse('nope'),
      providerResponse('nope'),
    ]);
    const result = await repo.transcribe({
      documentType: 'submission',
      imageJpeg: new Uint8Array([1]),
      isRetry: false,
    });
    expect(result.outcome).toBe('failed');
    expect(result.failure.code).toBe('invalid_output');
  });
});

describe('TASK-013 JSON extraction and cost estimate', () => {
  it('extracts fenced and embedded JSON objects', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJsonObject('Here you go: {"a":1}')).toEqual({ a: 1 });
    expect(() => extractJsonObject('no object')).toThrow();
  });

  it('prefers provider-reported cost, estimates from tokens, then unavailable', () => {
    expect(estimateCost({ costUsd: 0.02 })).toEqual({ costUsd: 0.02, costSource: 'provider_reported' });
    expect(estimateCost({ promptTokens: 1_000_000, completionTokens: 1_000_000 })).toEqual({
      costUsd: 6,
      costSource: 'token_estimate',
    });
    expect(estimateCost(null)).toEqual({ costUsd: null, costSource: 'unavailable' });
  });
});

describe('TASK-014 region identity dedup (PAT-001)', () => {
  it('reissues duplicate region ids so each crop is unique', () => {
    const draft = {
      schemaVersion: 1 as const,
      doc: {
        type: 'doc' as const,
        content: [
          {
            type: 'imageRegion' as const,
            attrs: { regionId: UUID_B, x: 0, y: 0, width: 0.5, height: 0.5, reason: 'diagram' as const },
          },
          {
            type: 'imageRegion' as const,
            attrs: { regionId: UUID_B, x: 0.5, y: 0, width: 0.5, height: 0.5, reason: 'other' as const },
          },
        ],
      },
    };
    const deduped = dedupeRegionIds(draft);
    const regions = deduped.doc.content as Array<{ attrs: { regionId: string } }>;
    expect(regions[0]!.attrs.regionId).toBe(UUID_B);
    expect(regions[1]!.attrs.regionId).not.toBe(UUID_B);
  });
});

// ——— TASK-014: queue consumer —————————————————————————————————————————————————

const repositoryOver = (overrides: {
  claim?: Partial<ReturnType<typeof claim>> | null;
  markTranscribing?: boolean;
  persistCompletion?: 'completed' | 'stale' | 'throw';
  persistFailure?: 'failed' | 'stale' | 'throw';
  resetToQueued?: Error | null;
}) => {
  const repo = Object.create(TranscriptionRepository.prototype) as TranscriptionRepository;
  repo.claimPageForRevision = vi.fn().mockResolvedValue(
    overrides.claim === null ? null : claim(overrides.claim ?? {}),
  );
  repo.markTranscribing = vi.fn().mockResolvedValue(overrides.markTranscribing ?? true);
  repo.persistCompletion = vi.fn().mockImplementation(
    overrides.persistCompletion === 'throw'
      ? async () => { throw new Error('db down'); }
      : async () => overrides.persistCompletion ?? 'completed',
  );
  repo.persistFailure = vi.fn().mockResolvedValue(overrides.persistFailure ?? 'failed');
  repo.resetToQueued = vi.fn().mockImplementation(
    overrides.resetToQueued ? async () => { throw overrides.resetToQueued!; } : async () => undefined,
  );
  repo.recordAuditOnly = vi.fn().mockResolvedValue(undefined);
  repo.latestAttemptFailureCode = vi.fn().mockResolvedValue('provider_timeout');
  repo.persistDlqFailure = vi.fn().mockResolvedValue('recorded');
  return repo;
};

const depsOver = (
  repo: TranscriptionRepository,
  openrouter?: OpenRouterRepository,
  image?: { ok: true; bytes: Uint8Array } | { ok: false; code: 'storage_failure' | 'invalid_image' },
): TranscriptionMessageDeps => ({
  repository: repo,
  bucket: { get: vi.fn() } as unknown as R2Bucket,
  images: {} as ImagesBinding,
  openrouter: openrouter ?? openrouterOver([providerResponse(JSON.stringify(validModelPayload()))]),
  primaryModel: 'm/primary',
  analytics: undefined,
});

// Patch loadTranscriptionVariant through the module boundary: the service
// resolves the image itself, so the fake bucket/images pair must produce a
// readable object. Simpler: exercise the real path with a small fake.
const fakeImagesBinding = (): ImagesBinding =>
  ({
    input: () => ({
      transform: () => ({
        output: async () => ({ image: () => new Response(new Uint8Array([9, 9, 9]).buffer).body }),
      }),
    }),
  }) as unknown as ImagesBinding;

const bucketOver = (bytes: Uint8Array | null): R2Bucket =>
  ({
    get: async () => (bytes ? { body: new Response(bytes.slice().buffer).body } : null),
  }) as unknown as R2Bucket;

describe('TASK-014 queue consumer (SEC-004, REQ-014)', () => {
  it('acks a stale revision without writing (idempotent duplicate delivery)', async () => {
    const repo = repositoryOver({ claim: null });
    const outcome = await handleTranscriptionMessage(pageMessage(), depsOver(repo));
    expect(outcome.handled).toBe('ack');
    expect(repo.markTranscribing).not.toHaveBeenCalled();
  });

  it('acks a duplicate delivery of an already-completed page', async () => {
    const repo = repositoryOver({ claim: { processingState: 'completed' } });
    const outcome = await handleTranscriptionMessage(pageMessage(), depsOver(repo));
    expect(outcome.handled).toBe('ack');
  });

  it('acks when a competing delivery wins the transcribing claim', async () => {
    const repo = repositoryOver({ markTranscribing: false });
    const outcome = await handleTranscriptionMessage(pageMessage(), depsOver(repo));
    expect(outcome.handled).toBe('ack');
  });

  it('persists completion, then acks; siblings are never reprocessed', async () => {
    const repo = repositoryOver({});
    const deps = depsOver(repo);
    deps.images = fakeImagesBinding();
    deps.bucket = bucketOver(new Uint8Array([7, 8, 9]));
    const outcome = await handleTranscriptionMessage(pageMessage(), deps);
    expect(outcome.handled).toBe('ack');
    expect(repo.persistCompletion).toHaveBeenCalledTimes(1);
    const input = (repo.persistCompletion as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      draft: unknown;
      segments: Array<{ key: string }>;
      audit: { attempt: number; model: string; outcome: string; costSource: string };
    };
    expect(input.segments[0]!.key).toBe('q1');
    expect(input.audit.attempt).toBe(1);
    expect(input.audit.outcome).toBe('completed');
  });

  it('acks a stale persistence result and keeps the attempt queryable', async () => {
    const repo = repositoryOver({ persistCompletion: 'stale' });
    const deps = depsOver(repo);
    deps.images = fakeImagesBinding();
    deps.bucket = bucketOver(new Uint8Array([1]));
    const outcome = await handleTranscriptionMessage(pageMessage(), deps);
    expect(outcome.handled).toBe('ack');
    expect(repo.recordAuditOnly).toHaveBeenCalledTimes(1);
  });

  it('records terminal invalid_output failure and acks without retry', async () => {
    const repo = repositoryOver({});
    const failing = openrouterOver([
      providerResponse('garbage'),
      providerResponse('garbage'),
    ]);
    const deps = depsOver(repo, failing);
    deps.images = fakeImagesBinding();
    deps.bucket = bucketOver(new Uint8Array([1]));
    const outcome = await handleTranscriptionMessage(pageMessage(), deps);
    expect(outcome.handled).toBe('ack');
    expect(repo.persistFailure).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: 'invalid_output' }),
    );
    expect(repo.resetToQueued).not.toHaveBeenCalled();
  });

  it('retries transient provider timeouts with a delay, page back to queued', async () => {
    const repo = repositoryOver({});
    const timeout = openrouterOver([new DOMException('aborted', 'AbortError')]);
    const deps = depsOver(repo, timeout);
    deps.images = fakeImagesBinding();
    deps.bucket = bucketOver(new Uint8Array([1]));
    const outcome = await handleTranscriptionMessage(pageMessage(), deps);
    expect(outcome.handled).toBe('retry');
    expect(outcome.delaySeconds).toBeGreaterThan(0);
    expect(repo.recordAuditOnly).toHaveBeenCalledTimes(1);
    expect(repo.resetToQueued).toHaveBeenCalledWith(PAGE_ID, 1);
    expect(repo.persistFailure).not.toHaveBeenCalled();
  });

  it('fails terminal invalid_image and storage classes without a provider call', async () => {
    for (const code of ['invalid_image', 'storage_failure'] as const) {
      const repo = repositoryOver({});
      const deps = depsOver(repo);
      deps.bucket = bucketOver(null); // missing object → storage path
      if (code === 'invalid_image') {
        deps.images = {
          input: () => { throw new Error('cannot decode'); },
        } as unknown as ImagesBinding;
        deps.bucket = bucketOver(new Uint8Array([1]));
      }
      const outcome = await handleTranscriptionMessage(pageMessage(), deps);
      expect(outcome.handled).toBe('ack');
      expect(repo.persistFailure).toHaveBeenCalledWith(
        expect.objectContaining({ failureCode: code }),
      );
    }
  });

  it('isolates a persistence crash as a retry, not an ack', async () => {
    const repo = repositoryOver({ persistCompletion: 'throw' });
    const deps = depsOver(repo);
    deps.images = fakeImagesBinding();
    deps.bucket = bucketOver(new Uint8Array([1]));
    const outcome = await handleTranscriptionMessage(pageMessage(), deps);
    expect(outcome.handled).toBe('retry');
  });
});

describe('TASK-014 DLQ handling (review-note replacement)', () => {
  it('persists the actionable failed state for a DLQ envelope', async () => {
    const repo = repositoryOver({});
    const outcome = await handleTranscriptionDlqMessage(
      {
        kind: 'transcription_dlq',
        original: pageMessage(),
        failureCode: 'provider_timeout',
        attemptsMade: 3,
        lastErrorAtMs: 1,
      },
      depsOver(repo),
    );
    expect(outcome.handled).toBe('ack');
    expect(repo.persistDlqFailure).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: PAGE_ID, failureCode: 'provider_timeout' }),
    );
  });

  it('classifies an auto-moved raw page message from the audit trail', async () => {
    const repo = repositoryOver({});
    repo.latestAttemptFailureCode = vi.fn().mockResolvedValue('provider_rejected');
    await handleTranscriptionDlqMessage(pageMessage(), depsOver(repo));
    expect(repo.persistDlqFailure).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: 'provider_rejected' }),
    );
  });

  it('defaults an audit-less raw message to provider_timeout', async () => {
    const repo = repositoryOver({});
    repo.latestAttemptFailureCode = vi.fn().mockResolvedValue(null);
    await handleTranscriptionDlqMessage(pageMessage(), depsOver(repo));
    expect(repo.persistDlqFailure).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: 'provider_timeout' }),
    );
  });
});
