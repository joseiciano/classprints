import { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import type {
  DocumentProcessingResponse,
  ProcessingPageItem,
  RetranscribeDocumentBody,
} from '@classprints/assignment-reader-shared';
import { formatDateTime } from '../../lib/assignment-reader-format';
import { formatElapsed } from './processing-detail';
import { ProcessingStateChip } from './status-chips';

export interface RetranscribeControls {
  /** Whether any current page carries a teacher edit — gates the overwrite consent. */
  hasTeacherEdits: boolean;
  /** Whether the submission has any current question judgments — gates the reset consent. */
  hasQuestionJudgments: boolean;
  documentRevision: number;
}

export interface ProcessingDetailViewProps {
  response: DocumentProcessingResponse;
  readOnly: boolean;
  onReviewPage: (pageId: string) => void;
  onRetryPage: (pageId: string) => void;
  onReplacePage: (pageId: string, file: File) => void;
  onRetranscribe: (body: RetranscribeDocumentBody) => void;
  onRetryConfirmDelivery: () => void;
  retryPendingPageId: string | null;
  replacePendingPageId: string | null;
  retranscribeControls: RetranscribeControls;
}

/**
 * The per-document page detail (TASK-023): per-page recovery actions (retry
 * the one failed page by default, replace its image, or escalate to
 * whole-document retranscription) plus the explicit, separately-confirmed
 * retranscription consent. A pure view — every mutation is a callback prop,
 * and navigation to a page's workspace is the caller's responsibility
 * (`onReviewPage`), so this component never depends on a router.
 */
export function ProcessingDetailView({
  response,
  readOnly,
  onReviewPage,
  onRetryPage,
  onReplacePage,
  onRetranscribe,
  onRetryConfirmDelivery,
  retryPendingPageId,
  replacePendingPageId,
  retranscribeControls,
}: ProcessingDetailViewProps) {
  return (
    <div className="space-y-5">
      <ul className="space-y-2">
        {response.data.map((page) => (
          <PageRow
            key={page.id}
            page={page}
            readOnly={readOnly}
            onReviewPage={onReviewPage}
            onRetryPage={onRetryPage}
            onReplacePage={onReplacePage}
            isRetryPending={retryPendingPageId === page.id}
            isReplacePending={replacePendingPageId === page.id}
          />
        ))}
      </ul>

      {!readOnly ? (
        <RetranscribeSection
          pageCount={response.data.length}
          controls={retranscribeControls}
          onRetranscribe={onRetranscribe}
        />
      ) : null}

      <div className="rounded-[10px] border border-border bg-muted/30 p-3.5 text-xs text-muted-foreground">
        <p>
          Default retry reprocesses only the failed page; succeeded pages are never reprocessed. If a
          committed action&apos;s queue delivery failed, use retry queue delivery to re-enqueue only
          the undelivered revisions.
        </p>
        <button
          type="button"
          disabled={readOnly}
          onClick={onRetryConfirmDelivery}
          className="mt-2 inline-flex min-h-8 items-center rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground hover:border-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          Retry queue delivery
        </button>
      </div>
    </div>
  );
}

function PageRow({
  page,
  readOnly,
  onReviewPage,
  onRetryPage,
  onReplacePage,
  isRetryPending,
  isReplacePending,
}: {
  page: ProcessingPageItem;
  readOnly: boolean;
  onReviewPage: (pageId: string) => void;
  onRetryPage: (pageId: string) => void;
  onReplacePage: (pageId: string, file: File) => void;
  isRetryPending: boolean;
  isReplacePending: boolean;
}) {
  const isNonTerminal =
    page.processingState === 'uploading' ||
    page.processingState === 'queued' ||
    page.processingState === 'transcribing';

  return (
    <li className="space-y-2 rounded-[10px] border border-border bg-card p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{page.label}</p>
          <p className="font-mono text-xs text-muted-foreground">
            Uploaded {formatDateTime(page.uploadedAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProcessingStateChip state={page.processingState} />
          {isNonTerminal ? (
            <span className="font-mono text-xs text-muted-foreground">
              attempt {page.attemptCount} · elapsed {formatElapsed(page.elapsedFromQueuedMs)}
            </span>
          ) : null}
          {page.processingState === 'completed' && page.draftAvailable ? (
            <button
              type="button"
              onClick={() => onReviewPage(page.id)}
              className="inline-flex min-h-8 items-center gap-1 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-pine-ink dark:hover:bg-primary/80"
            >
              <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
              Review now
            </button>
          ) : null}
        </div>
      </div>

      {page.processingState === 'failed' && page.failure ? (
        <div className="space-y-2 rounded-[8px] border border-destructive/30 bg-destructive/5 p-3">
          <p className="inline-flex items-center gap-1.5 font-mono text-xs text-destructive">
            <AlertCircle aria-hidden="true" className="h-3.5 w-3.5" />
            {page.failure.message}
          </p>
          <div className="flex flex-wrap gap-2">
            {page.failure.retryAllowed && !readOnly ? (
              <button
                type="button"
                aria-label={`Retry page ${page.label}`}
                disabled={isRetryPending}
                onClick={() => onRetryPage(page.id)}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-pine-ink disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-primary/80"
              >
                {isRetryPending ? (
                  <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                )}
                Retry page
              </button>
            ) : null}
            {!readOnly ? (
              <label className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground hover:border-primary">
                {isReplacePending ? 'Replacing…' : 'Replace page image'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/heic,image/heif"
                  disabled={isReplacePending}
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onReplacePage(page.id, file);
                    event.target.value = '';
                  }}
                />
              </label>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

function RetranscribeSection({
  pageCount,
  controls,
  onRetranscribe,
}: {
  pageCount: number;
  controls: RetranscribeControls;
  onRetranscribe: (body: RetranscribeDocumentBody) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [resetJudgments, setResetJudgments] = useState(false);

  const canSubmit =
    confirmed &&
    (!controls.hasTeacherEdits || overwrite) &&
    (!controls.hasQuestionJudgments || resetJudgments);

  return (
    <div className="space-y-3 rounded-[10px] border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-medium text-foreground">
            Retranscribe entire document
          </h3>
          <p className="text-xs text-muted-foreground">
            All {pageCount} current page{pageCount === 1 ? '' : 's'} reprocess again.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          className="inline-flex min-h-9 items-center rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground hover:border-primary"
        >
          Retranscribe document
        </button>
      </div>

      {isOpen ? (
        <div className="space-y-2.5 border-t border-border pt-3">
          <label className="flex items-start gap-2.5 text-sm text-foreground">
            <input
              type="checkbox"
              aria-label="Confirm retranscription"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-primary"
            />
            I confirm retranscription of the current document revision, including its re-billing.
          </label>
          <label className="flex items-start gap-2.5 text-sm text-foreground">
            <input
              type="checkbox"
              aria-label="Teacher edits overwrite consent"
              disabled={!controls.hasTeacherEdits}
              checked={overwrite}
              onChange={(event) => setOverwrite(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
            />
            I understand this will overwrite teacher edits on current pages.
          </label>
          <label className="flex items-start gap-2.5 text-sm text-foreground">
            <input
              type="checkbox"
              aria-label="Question judgments reset consent"
              disabled={!controls.hasQuestionJudgments}
              checked={resetJudgments}
              onChange={(event) => setResetJudgments(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
            />
            I understand current question judgments on this submission will reset.
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="inline-flex min-h-9 items-center rounded-full border border-border px-3.5 text-[13px] font-semibold text-foreground hover:border-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() =>
                onRetranscribe({
                  expectedDocumentRevision: controls.documentRevision,
                  confirmed: true,
                  overwriteTeacherEdits: overwrite,
                  resetQuestionJudgments: resetJudgments,
                })
              }
              className="inline-flex min-h-9 items-center rounded-full bg-destructive px-3.5 text-[13px] font-semibold text-destructive-foreground hover:bg-destructive/85 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Retranscribe all pages
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
