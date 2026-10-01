import { z } from 'zod';
import type { Sql } from '@classprints/server/db';
import type {
  FailureCode,
  ParsedAssignmentDraft,
  TranscriptionModelOutputPayload,
} from '@classprints/assignment-reader-shared';
import { validateAssignmentDraft } from '@classprints/assignment-reader-shared';

/**
 * Transcription repository (TASK-014). Owns every Postgres access for the
 * per-page queue consumer: the revision-aware claim, the conditional
 * transcribing transition, the single transaction persisting draft + question
 * segments + attempt audit + completion, the terminal failure recorder, and
 * the DLQ failed-state persistence that replaces the Phase 2 ack-only
 * placeholder.
 *
 * SEC-004: every write is a conditional update on (pageId, transcription
 * revision), so a stale or duplicate delivery can never overwrite a newer
 * upload, retry, teacher edit, or consent decision. attempt_count increments
 * exactly when an execution is accepted (markTranscribing); queue-delivery
 * retries and provider retries inside one execution never touch it.
 */

export interface PageClaimRow {
  id: string;
  storageKey: string;
  documentType: 'materials' | 'submission';
  materialsVersionId: string | null;
  submissionId: string | null;
  pageRevision: number;
  processingState: 'uploading' | 'queued' | 'transcribing' | 'completed' | 'failed';
  attemptCount: number;
  queuedAtMs: number | null;
}

export interface AttemptAuditInput {
  documentType: 'materials' | 'submission';
  model: string;
  attempt: number;
  queuedAtMs: number;
  startedAtMs: number;
  endedAtMs: number;
  latencyMs: number;
  outcome: 'completed' | 'failed' | 'retry';
  failureCode: FailureCode | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  providerCostUsd: number | null;
  costUsd: number | null;
  costSource: 'provider_reported' | 'token_estimate' | 'unavailable' | null;
  isRetry: boolean;
}

/** Normalized per-page cost estimate and its calculation source (REQ-025).
 * Provider-reported cost wins; otherwise a conservative token-based
 * estimate; otherwise explicitly `unavailable` — never silently zero. */
export const estimateCost = (
  usage: { promptTokens?: number; completionTokens?: number; costUsd?: number } | null,
): { costUsd: number | null; costSource: 'provider_reported' | 'token_estimate' | 'unavailable' } => {
  if (usage && typeof usage.costUsd === 'number' && Number.isFinite(usage.costUsd) && usage.costUsd >= 0) {
    return { costUsd: usage.costUsd, costSource: 'provider_reported' };
  }
  if (usage && typeof usage.promptTokens === 'number' && typeof usage.completionTokens === 'number') {
    const estimate = ((usage.promptTokens + usage.completionTokens) / 1_000_000) * 3;
    return { costUsd: Math.min(estimate, 999_999), costSource: 'token_estimate' };
  }
  return { costUsd: null, costSource: 'unavailable' };
};

const claimSchema = z.object({
  id: z.string(),
  storage_key: z.string(),
  document_type: z.enum(['materials', 'submission']),
  materials_version_id: z.string().nullable(),
  submission_id: z.string().nullable(),
  page_revision: z.coerce.number().int().min(1),
  processing_state: z.enum(['uploading', 'queued', 'transcribing', 'completed', 'failed']),
  attempt_count: z.coerce.number().int().min(0),
  queued_at_ms: z.coerce.number().nullable(),
});

const mapClaim = (row: z.infer<typeof claimSchema>): PageClaimRow => ({
  id: row.id,
  storageKey: row.storage_key,
  documentType: row.document_type,
  materialsVersionId: row.materials_version_id,
  submissionId: row.submission_id,
  pageRevision: row.page_revision,
  processingState: row.processing_state,
  attemptCount: row.attempt_count,
  queuedAtMs: row.queued_at_ms,
});

export class InvalidOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOutputError';
  }
}

/**
 * Ensures imageRegion ids are unique within the persisted draft (PAT-001).
 * The schema already guarantees valid UUIDs; duplicates would render the
 * same crop for different coordinates, so later duplicates are reissued.
 */
export const dedupeRegionIds = (draft: ParsedAssignmentDraft): ParsedAssignmentDraft => {
  const seen = new Set<string>();
  const visit = (node: ParsedAssignmentDraft['doc'] | ParsedAssignmentDraft['doc']['content'][number]): void => {
    const record = node as { type?: string; attrs?: { regionId?: string }; content?: unknown[] };
    if (record.type === 'imageRegion' && record.attrs) {
      if (!record.attrs.regionId || seen.has(record.attrs.regionId)) {
        record.attrs.regionId = crypto.randomUUID();
      }
      seen.add(record.attrs.regionId);
    }
    if (Array.isArray(record.content)) {
      for (const child of record.content) {
        visit(child as ParsedAssignmentDraft['doc']['content'][number]);
      }
    }
  };
  visit(draft.doc);
  return draft;
};

export class TranscriptionRepository {
  constructor(private readonly sql: Sql) {}

  /**
   * Loads the page ONLY while its current revision still equals the message's
   * transcription revision. Returns null for a stale message (page was
   * retried, replaced, or edited past this revision) or an unknown page —
   * the consumer acknowledges both without writing (SEC-004).
   */
  async claimPageForRevision(pageId: string, transcriptionRevision: number): Promise<PageClaimRow | null> {
    const rows = await this.sql`
      select p.id, p.storage_key, p.document_type, p.materials_version_id,
             p.submission_id, p.page_revision, p.processing_state,
             p.attempt_count, p.queued_at_ms
      from public.pages p
      where p.id = ${pageId}::uuid and p.page_revision = ${transcriptionRevision}
      limit 1`;
    const parsed = z.array(claimSchema).safeParse(rows);
    if (!parsed.success || parsed.data.length === 0) {
      return null;
    }
    return mapClaim(parsed.data[0]!);
  }

  /**
   * Conditional acceptance: moves queued (or an interrupted transcribing
   * redelivery) to transcribing and increments attempt_count — only when the
   * revision still matches. Returns false when a competing action advanced
   * the row between the claim read and this write.
   */
  async markTranscribing(pageId: string, transcriptionRevision: number, startedAtMs: number): Promise<boolean> {
    const rows = await this.sql`
      update public.pages set
        processing_state = 'transcribing',
        started_at_ms = ${startedAtMs},
        attempt_count = attempt_count + 1,
        updated_at_ms = ${startedAtMs}
      where id = ${pageId}::uuid
        and page_revision = ${transcriptionRevision}
        and processing_state in ('queued', 'transcribing')
      returning id`;
    return rows.length > 0;
  }

  /**
   * Returns the page to queued after a transient provider failure or an
   * orphaned execution, conditionally on the revision still matching and
   * the page still being transcribing. `started_at_ms` clears so the next
   * accepted execution stamps a fresh start.
   */
  async resetToQueued(pageId: string, transcriptionRevision: number): Promise<void> {
    const now = Date.now();
    await this.sql`
      update public.pages set
        processing_state = 'queued',
        started_at_ms = null,
        updated_at_ms = ${now}
      where id = ${pageId}::uuid
        and page_revision = ${transcriptionRevision}
        and processing_state = 'transcribing'`;
  }

  /**
   * Persists one accepted execution's success in exactly one transaction:
   * attempt audit, validated draft, replacement question segments for the
   * revision, page completion, and — when the last current page of a
   * confirmed document completes — the document review state needs_review
   * (REQ-011). The conditional update re-checks revision + transcribing
   * state inside the transaction, so a retry, teacher edit, or replacement
   * committed in the meantime makes this a 'stale' no-op.
   */
  async persistCompletion(input: {
    pageId: string;
    transcriptionRevision: number;
    materialsVersionId: string | null;
    submissionId: string | null;
    startedAtMs: number;
    completedAtMs: number;
    draft: TranscriptionModelOutputPayload['draft'];
    segments: TranscriptionModelOutputPayload['questionSegments'];
    audit: AttemptAuditInput;
  }): Promise<'completed' | 'stale'> {
    // SEC-002: the draft is re-validated against the shared schema at the
    // persistence boundary even though the provider path validated it; the
    // database must never receive unvalidated model output.
    const draftCheck = validateAssignmentDraft(input.draft);
    const parsedDraft = draftCheck.data;
    if (!draftCheck.ok || !parsedDraft) {
      throw new InvalidOutputError(draftCheck.issues.join('; '));
    }
    const draft = dedupeRegionIds(parsedDraft);

    return this.sql.begin(async (tx) => {
      const claimed = await tx`
        update public.pages set
          draft = ${this.sql.json(JSON.parse(JSON.stringify(draft)))}::jsonb,
          processing_state = 'completed',
          completed_at_ms = ${input.completedAtMs},
          updated_at_ms = ${input.completedAtMs}
        where id = ${input.pageId}::uuid
          and page_revision = ${input.transcriptionRevision}
          and processing_state = 'transcribing'
        returning id`;
      if (claimed.length === 0) {
        return 'stale';
      }

      await tx`
        insert into public.transcription_attempts (
          page_id, page_revision, document_type, model, attempt,
          queued_at_ms, started_at_ms, ended_at_ms, latency_ms, outcome,
          failure_code, provider_prompt_tokens, provider_completion_tokens,
          provider_total_tokens, provider_cost_usd, cost_usd, cost_source, is_retry, created_at_ms
        ) values (
          ${input.pageId}::uuid, ${input.transcriptionRevision}, ${input.audit.documentType},
          ${input.audit.model}, ${input.audit.attempt}, ${input.audit.queuedAtMs},
          ${input.audit.startedAtMs}, ${input.audit.endedAtMs}, ${input.audit.latencyMs},
          ${input.audit.outcome}, ${input.audit.failureCode}, ${input.audit.promptTokens},
          ${input.audit.completionTokens}, ${input.audit.totalTokens},
          ${input.audit.providerCostUsd}, ${input.audit.costUsd}, ${input.audit.costSource},
          ${input.audit.isRetry}, ${input.completedAtMs}
        )`;

      // Supersede-and-insert within one revision: the (page, revision,
      // ordinal) unique index keeps segments deterministic; a duplicate
      // delivery replays by deleting the first delivery's rows first.
      // PAT-004: teacher judgments live in question_judgments keyed by
      // segment id and are never remapped or deleted here.
      await tx`
        delete from public.question_segments
        where page_id = ${input.pageId}::uuid and page_revision = ${input.transcriptionRevision}`;
      for (const [index, segment] of input.segments.entries()) {
        await tx`
          insert into public.question_segments (
            page_id, page_revision, ordinal, label, question_text, response_text, created_at_ms
          ) values (
            ${input.pageId}::uuid, ${input.transcriptionRevision}, ${index + 1},
            ${segment.label ?? null}, ${segment.questionText ?? null},
            ${segment.responseText ?? null}, ${input.completedAtMs}
          )`;
      }

      // REQ-011: when the last current page completes, a confirmed document
      // enters needs_review. Static branches per document type — table and
      // column names are fixed constants, never request input (SEC-002).
      if (input.audit.documentType === 'materials') {
        if (input.materialsVersionId) {
          const remaining = await tx<{ n: number }[]>`
            select count(*)::int as n from public.pages
            where materials_version_id = ${input.materialsVersionId}::uuid
              and processing_state <> 'completed'`;
          if (Number(remaining[0]?.n ?? 0) === 0) {
            await tx`
              update public.assignment_material_versions set
                review_state = 'needs_review',
                updated_at_ms = ${input.completedAtMs}
              where id = ${input.materialsVersionId}::uuid and draft_confirmed = true`;
          }
        }
      } else {
        if (input.submissionId) {
          const remaining = await tx<{ n: number }[]>`
            select count(*)::int as n from public.pages
            where submission_id = ${input.submissionId}::uuid
              and processing_state <> 'completed'`;
          if (Number(remaining[0]?.n ?? 0) === 0) {
            await tx`
              update public.submissions set
                review_state = 'needs_review',
                updated_at_ms = ${input.completedAtMs}
              where id = ${input.submissionId}::uuid and draft_confirmed = true`;
          }
        }
      }
      return 'completed';
    });
  }

  /**
   * Records a terminal failure (REQ-014): failure code + safe message on the
   * page and the attempt audit row, conditionally on the page still being
   * transcribing at the message's revision.
   */
  async persistFailure(input: {
    pageId: string;
    transcriptionRevision: number;
    failureCode: FailureCode;
    failureMessage: string;
    audit: AttemptAuditInput;
    endedAtMs: number;
  }): Promise<'failed' | 'stale'> {
    return this.sql.begin(async (tx) => {
      const claimed = await tx`
        update public.pages set
          processing_state = 'failed',
          failure_code = ${input.failureCode},
          failure_message = ${input.failureMessage},
          updated_at_ms = ${input.endedAtMs}
        where id = ${input.pageId}::uuid
          and page_revision = ${input.transcriptionRevision}
          and processing_state = 'transcribing'
        returning id`;
      if (claimed.length === 0) {
        return 'stale';
      }
      await tx`
        insert into public.transcription_attempts (
          page_id, page_revision, document_type, model, attempt,
          queued_at_ms, started_at_ms, ended_at_ms, latency_ms, outcome,
          failure_code, provider_prompt_tokens, provider_completion_tokens,
          provider_total_tokens, provider_cost_usd, cost_usd, cost_source, is_retry, created_at_ms
        ) values (
          ${input.pageId}::uuid, ${input.transcriptionRevision}, ${input.audit.documentType},
          ${input.audit.model}, ${input.audit.attempt}, ${input.audit.queuedAtMs},
          ${input.audit.startedAtMs}, ${input.audit.endedAtMs}, ${input.audit.latencyMs},
          ${input.audit.outcome}, ${input.audit.failureCode}, ${input.audit.promptTokens},
          ${input.audit.completionTokens}, ${input.audit.totalTokens},
          ${input.audit.providerCostUsd}, ${input.audit.costUsd}, ${input.audit.costSource},
          ${input.audit.isRetry}, ${input.endedAtMs}
        )`;
      return 'failed';
    });
  }

  /**
   * Audit row for an accepted execution whose result could not be persisted
   * (storage failure before the page write, or a stale claim discovered at
   * persistence time). REQ-025: every accepted attempt stays queryable.
   */
  async recordAuditOnly(
    audit: AttemptAuditInput,
    pageId: string,
    pageRevision: number,
    nowMs: number,
  ): Promise<void> {
    await this.sql`
      insert into public.transcription_attempts (
        page_id, page_revision, document_type, model, attempt,
        queued_at_ms, started_at_ms, ended_at_ms, latency_ms, outcome,
        failure_code, provider_prompt_tokens, provider_completion_tokens,
        provider_total_tokens, provider_cost_usd, cost_usd, cost_source, is_retry, created_at_ms
      ) values (
        ${pageId}::uuid, ${pageRevision}, ${audit.documentType}, ${audit.model}, ${audit.attempt},
        ${audit.queuedAtMs}, ${audit.startedAtMs}, ${audit.endedAtMs}, ${audit.latencyMs},
        ${audit.outcome}, ${audit.failureCode}, ${audit.promptTokens}, ${audit.completionTokens},
        ${audit.totalTokens}, ${audit.providerCostUsd}, ${audit.costUsd}, ${audit.costSource},
        ${audit.isRetry}, ${nowMs}
      )`;
  }

  /** Latest recorded failure code for a page revision (DLQ classification). */
  async latestAttemptFailureCode(pageId: string, pageRevision: number): Promise<FailureCode | null> {
    const rows = await this.sql<{ failure_code: string | null }[]>`
      select failure_code from public.transcription_attempts
      where page_id = ${pageId}::uuid and page_revision = ${pageRevision}
        and failure_code is not null
      order by ended_at_ms desc
      limit 1`;
    const code = rows[0]?.failure_code;
    return code === 'provider_timeout' || code === 'provider_rejected' || code === 'invalid_output'
      || code === 'storage_failure' || code === 'invalid_image'
      ? code
      : null;
  }

  /**
   * DLQ failed-state persistence (TASK-014 review note): replaces the Phase
   * 2 ack-only DLQ placeholder. When the message's revision is still the
   * page's current revision, the page lands in a visible failed state with
   * safe recovery guidance; superseded revisions keep their terminal state.
   */
  async persistDlqFailure(input: {
    pageId: string;
    transcriptionRevision: number;
    failureCode: FailureCode;
    nowMs: number;
  }): Promise<'recorded' | 'stale'> {
    const rows = await this.sql`
      update public.pages set
        processing_state = 'failed',
        failure_code = ${input.failureCode},
        failure_message = ${dlqMessage(input.failureCode)},
        updated_at_ms = ${input.nowMs}
      where id = ${input.pageId}::uuid
        and page_revision = ${input.transcriptionRevision}
        and processing_state in ('queued', 'transcribing')
      returning id`;
    return rows.length > 0 ? 'recorded' : 'stale';
  }
}

/** Safe recovery guidance for DLQ-parked pages; never a provider payload. */
const dlqMessage = (code: FailureCode): string => {
  switch (code) {
    case 'provider_timeout':
      return 'Transcription timed out repeatedly and was parked for recovery; retry this page.';
    case 'provider_rejected':
      return 'The transcription provider rejected this page repeatedly; retry, or replace the page image.';
    case 'invalid_output':
      return 'Transcription output was repeatedly invalid; retry this page.';
    case 'storage_failure':
      return 'The page image could not be read for transcription; replace this page.';
    case 'invalid_image':
      return 'The stored page image is not a supported image; replace this page.';
  }
};
