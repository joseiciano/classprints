import { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { AlertCircle, CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import type {
  DocumentType,
  ProcessingListQuery,
  ProcessingPageItem,
} from '@classprints/assignment-reader-shared';
import {
  useDocumentProcessingList,
  useDocumentWorkspace,
  useRetranscribeDocument,
  useRetryPage,
} from '../../hooks/use-assignment-reader';
import { replacePageImage } from '../../lib/assignment-reader-api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { assignmentReaderKeys } from '../../lib/assignment-reader-query-keys';
import { formatDateTime, formatElapsed } from '../../lib/assignment-reader-format';
import { usePageVisible, useTicker } from '../../hooks/use-page-visibility';
import { SeatingApiError } from '../../lib/http';
import { CanonicalList, type CanonicalListColumn } from './canonical-list';
import { ProcessingStateChip } from './status-chips';
import {
  RetranscribeConsentDialog,
  type RetranscribeConsentValues,
} from './retranscribe-consent-dialog';

const NON_TERMINAL = new Set(['uploading', 'queued', 'transcribing']);

function elapsedMsFor(row: ProcessingPageItem, now: number): number | null {
  if (!NON_TERMINAL.has(row.processingState)) return null;
  if (!row.queuedAt) return row.elapsedFromQueuedMs;
  return now - new Date(row.queuedAt).getTime();
}

export function ProcessingPanel({
  classId,
  assignmentId,
  documentType,
  documentId,
}: {
  classId: string;
  assignmentId: string;
  documentType: DocumentType;
  documentId: string;
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<NonNullable<ProcessingListQuery['sort']>>('uploadedAt');
  const [direction, setDirection] = useState<NonNullable<ProcessingListQuery['direction']>>('asc');
  const [page, setPage] = useState(1);
  const [retranscribeOpen, setRetranscribeOpen] = useState(false);
  const [replacingPageId, setReplacingPageId] = useState<string | null>(null);

  const workspace = useDocumentWorkspace(documentType, documentId);
  const visible = usePageVisible();

  const query: ProcessingListQuery = {
    q: search || undefined,
    sort,
    direction,
    page,
  };

  // Compute "any non-terminal" from the data already on hand so we only know
  // to keep polling after the first response; before that we still poll.
  const [lastKnownNonTerminal, setLastKnownNonTerminal] = useState(true);
  const refetchIntervalMs = visible && lastKnownNonTerminal ? 3000 : false;
  const processing = useDocumentProcessingList(documentType, documentId, query, refetchIntervalMs);

  const rows = processing.data?.data ?? [];
  const anyNonTerminal = rows.some((row) => NON_TERMINAL.has(row.processingState));
  useEffect(() => {
    if (!processing.isLoading && anyNonTerminal !== lastKnownNonTerminal) {
      setLastKnownNonTerminal(anyNonTerminal);
    }
  }, [anyNonTerminal, lastKnownNonTerminal, processing.isLoading]);

  // Live elapsed-time display (TASK-023): ticks client-side only, never
  // written back to the server, and only while something is still running.
  useTicker(1000, anyNonTerminal);
  const now = Date.now();

  const relatedKeys = [assignmentReaderKeys.documents.processing(documentType, documentId, query)];
  const retryPage = useRetryPage(documentType, documentId, relatedKeys);
  const retranscribe = useRetranscribeDocument(documentType, documentId, relatedKeys);
  const queryClient = useQueryClient();
  const replacePage = useMutation({
    mutationFn: ({ pageId, file }: { pageId: string; file: File }) => replacePageImage(pageId, file),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: assignmentReaderKeys.documents.aggregate(documentType, documentId),
      });
      setReplacingPageId(null);
    },
    onError: () => setReplacingPageId(null),
  });

  const failedRows = rows.filter((row) => row.processingState === 'failed');
  const anyPageEditedByTeacher = rows.some((row) => row.editedByTeacher);
  const canRetranscribe = workspace.data?.allowedActions.includes('retranscribe') ?? false;

  const workspaceLinkFor = (row: ProcessingPageItem) => ({
    to: '/classes/$classId/assignments/$assignmentId/documents/$documentType/$documentId/workspace' as const,
    params: { classId, assignmentId, documentType, documentId },
    search: { pageId: row.id },
  });

  const columns = useMemo<CanonicalListColumn<ProcessingPageItem>[]>(
    () => [
      { key: 'uploadedAt', header: 'Date', sortable: true, render: (row) => formatDateTime(row.uploadedAt) },
      {
        key: 'label',
        header: 'Name',
        sortable: true,
        render: (row) => <span className="font-medium text-foreground">{row.label}</span>,
      },
      {
        key: 'processingState',
        header: 'Status',
        sortable: true,
        render: (row) => (
          <div className="flex flex-wrap items-center gap-2.5">
            <ProcessingStateChip state={row.processingState} />
            {NON_TERMINAL.has(row.processingState) ? (
              <span className="font-mono text-xs text-muted-foreground">
                attempt {row.attemptCount} · elapsed {formatElapsed(elapsedMsFor(row, now))}
              </span>
            ) : null}
            {row.processingState === 'completed' ? (
              row.draftAvailable ? (
                <Link
                  to={workspaceLinkFor(row).to}
                  params={workspaceLinkFor(row).params}
                  search={workspaceLinkFor(row).search}
                  className="inline-flex min-h-8 items-center gap-1 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-pine-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-primary/80"
                >
                  <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
                  Review now
                </Link>
              ) : (
                <span className="text-xs text-muted-foreground">Draft not available</span>
              )
            ) : null}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [now],
  );

  return (
    <section className="space-y-6">
      <div className="space-y-3 rounded-[12px] border border-border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-medium text-foreground">Document state</h2>
            <p className="text-sm text-muted-foreground">Processing and review stay separate.</p>
          </div>
          {workspace.data ? <ProcessingStateChip state={workspace.data.processingState} /> : null}
        </div>
        {workspace.data ? (
          <p className="text-sm text-muted-foreground">
            {workspace.data.processingCounts.completed} / {workspace.data.processingCounts.total} pages
            completed
            {workspace.data.processingCounts.failed > 0
              ? ` · ${workspace.data.processingCounts.failed} failed`
              : ''}
            {workspace.data.processingCounts.transcribing > 0
              ? ` · ${workspace.data.processingCounts.transcribing} transcribing`
              : ''}
            {workspace.data.processingCounts.queued > 0 ? ` · ${workspace.data.processingCounts.queued} queued` : ''}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          A document enters Needs review only after every current page has an editable draft. Ready to
          grade still requires teacher verification.
        </p>
      </div>

      <section className="space-y-4 rounded-[12px] border border-border bg-card p-5 shadow-card">
        <h2 className="font-display text-xl font-medium text-foreground">Pages</h2>
        <CanonicalList<ProcessingPageItem>
          ariaLabel="Processing pages"
          columns={columns}
          rows={rows}
          getRowId={(row) => row.id}
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          searchLabel="Search pages"
          searchPlaceholder="Search by name or status…"
          sort={sort}
          direction={direction}
          onSortChange={(nextSort, nextDirection) => {
            setSort(nextSort as typeof sort);
            setDirection(nextDirection);
            setPage(1);
          }}
          page={page}
          totalPages={processing.data?.pagination.totalPages ?? 0}
          totalItems={processing.data?.pagination.totalItems ?? 0}
          onPageChange={setPage}
          isLoading={processing.isLoading}
          isFetching={processing.isFetching}
          error={processing.error}
          onRetry={() => void processing.refetch()}
          emptyState={<p className="text-sm text-muted-foreground">No pages uploaded yet.</p>}
          noMatchesFor={(value) => (
            <p className="text-sm text-muted-foreground">No pages match “{value}”.</p>
          )}
        />
      </section>

      {failedRows.length > 0 ? (
        <section className="space-y-4">
          {failedRows.map((row) => (
            <article
              key={row.id}
              className="space-y-3 rounded-[12px] border border-destructive/30 bg-destructive/5 p-5 shadow-card"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-lg font-medium text-foreground">{row.label}</h3>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
                  <AlertCircle aria-hidden="true" className="h-3.5 w-3.5" />
                  Error
                </span>
              </div>
              {row.failure ? (
                <p className="font-mono text-xs text-destructive">
                  {row.failure.message} · attempt {row.attemptCount}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {row.failure?.retryAllowed ? (
                  <button
                    type="button"
                    onClick={() => retryPage.mutate(row.id)}
                    disabled={retryPage.isPending}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground hover:bg-pine-ink disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-primary/80"
                  >
                    {retryPage.isPending ? (
                      <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                    )}
                    Retry page
                  </button>
                ) : null}
                <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground hover:border-primary">
                  {replacingPageId === row.id && replacePage.isPending ? 'Replacing…' : 'Replace page image'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/heic,image/heif"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        setReplacingPageId(row.id);
                        replacePage.mutate({ pageId: row.id, file });
                      }
                      event.target.value = '';
                    }}
                  />
                </label>
                {canRetranscribe ? (
                  <button
                    type="button"
                    onClick={() => setRetranscribeOpen(true)}
                    className="inline-flex min-h-9 items-center rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground hover:border-primary"
                  >
                    Retranscribe document
                  </button>
                ) : null}
              </div>
              {retryPage.error instanceof SeatingApiError ? (
                <p role="alert" className="text-sm text-destructive">{retryPage.error.message}</p>
              ) : null}
              {replacePage.error instanceof SeatingApiError ? (
                <p role="alert" className="text-sm text-destructive">{replacePage.error.message}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Default retry reprocesses only this page. Succeeded pages are never reprocessed.
              </p>
            </article>
          ))}
        </section>
      ) : null}

      <RetranscribeConsentDialog
        open={retranscribeOpen}
        onOpenChange={setRetranscribeOpen}
        pageCount={rows.length}
        anyPageEditedByTeacher={anyPageEditedByTeacher}
        documentType={documentType}
        isSubmitting={retranscribe.isPending}
        errorMessage={retranscribe.error instanceof SeatingApiError ? retranscribe.error.message : null}
        onConfirm={(values: RetranscribeConsentValues) => {
          if (!workspace.data) return;
          retranscribe.mutate(
            {
              expectedDocumentRevision: workspace.data.documentRevision,
              ...values,
            },
            { onSuccess: () => setRetranscribeOpen(false) },
          );
        }}
      />
    </section>
  );
}
