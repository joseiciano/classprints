import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronDown, ChevronUp, FileStack } from 'lucide-react';
import type { DocumentType } from '@classprints/assignment-reader-shared';
import {
  useCaptureReviewContext,
  useDocumentWorkspace,
  usePageWorkspace,
  useReviewSessionAnalytics,
} from '../../../hooks/use-assignment-reader';
import { formatDateTime } from '../../../lib/assignment-reader-format';
import { SeatingApiError } from '../../../lib/http';
import { LoadingScreen } from '../../ui/loading-screen';
import { AssignmentEditor, type PendingRegionInsert } from '../editor/assignment-editor';
import { GradingStateChip, ReviewStateChip } from '../status-chips';
import { GradingRail } from './grading-rail';
import { MaterialsRail } from './materials-rail';
import { OriginalViewer } from './original-viewer';
import { PageNav } from './page-nav';
import { ReviewControls } from './review-controls';

/**
 * The unified materials/submission workspace (TASK-025): one document
 * identity header, the original-image viewer and the draft editor kept
 * together across page navigation and reload, document-level review
 * controls, and — for a submission — the grading rail and a read-only
 * materials side rail opened on demand. Historical material versions and
 * anything under archived ancestry render read-only throughout.
 */
export function WorkspacePanel({
  classId,
  assignmentId,
  documentType,
  documentId,
  selectedPageId,
  onSelectedPageIdChange,
}: {
  classId: string;
  assignmentId: string;
  documentType: DocumentType;
  documentId: string;
  selectedPageId: string | undefined;
  onSelectedPageIdChange: (pageId: string | undefined) => void;
}) {
  const workspace = useDocumentWorkspace(documentType, documentId);
  const captureReviewContext = useCaptureReviewContext(documentId);
  const { recordMaterialsOpen } = useReviewSessionAnalytics(documentType, documentId);
  const [materialsOpen, setMaterialsOpen] = useState(false);

  const data = workspace.data;
  const needsReviewContextCapture =
    documentType === 'submission' &&
    data !== undefined &&
    !data.reviewContextCaptured &&
    !data.readOnly;

  useEffect(() => {
    // Only auto-fire the very first attempt. If it fails, `isIdle` flips to
    // false and stays false, so this effect won't silently retry in a loop —
    // the error banner below offers an explicit "Retry" instead.
    if (needsReviewContextCapture && captureReviewContext.isIdle) {
      captureReviewContext.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsReviewContextCapture]);

  if (workspace.isLoading || !data) {
    return <LoadingScreen fullScreen={false} />;
  }

  const pages = [...data.pages].sort((a, b) => a.position - b.position);
  const selectedPage = pages.find((page) => page.id === selectedPageId) ?? pages[0];
  const isCompleted = selectedPage?.processingState === 'completed';

  const identity =
    documentType === 'materials'
      ? `${data.assignment.name} · Materials`
      : `${data.student?.name ?? 'Student'} · Submission`;

  return (
    <div className="space-y-6">
      <section aria-labelledby="workspace-identity" className="space-y-4 rounded-[12px] border border-border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {documentType === 'materials' ? 'Materials' : 'Student work'}
          </span>
          <h1 id="workspace-identity" className="font-display text-xl font-medium text-foreground">
            {identity}
          </h1>
          <ReviewStateChip state={data.reviewState} />
          {documentType === 'submission' ? <GradingStateChip state={data.gradingState} /> : null}
          <span className="text-sm text-muted-foreground">{pages.length} pages</span>
          {data.assignment.maxScore !== null ? (
            <span className="text-sm text-muted-foreground">Max {data.assignment.maxScore}</span>
          ) : null}
          {documentType === 'submission' ? (
            <button
              type="button"
              onClick={() =>
                setMaterialsOpen((open) => {
                  const next = !open;
                  if (next) recordMaterialsOpen();
                  return next;
                })
              }
              className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground hover:border-primary"
            >
              <FileStack aria-hidden="true" className="h-3.5 w-3.5" />
              {materialsOpen ? 'Hide materials' : 'Open materials'}
              {materialsOpen ? (
                <ChevronUp aria-hidden="true" className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
              )}
            </button>
          ) : null}
        </div>

        {data.readOnly ? (
          <p role="status" className="rounded-[10px] border border-border bg-muted px-3.5 py-2 text-sm text-muted-foreground">
            {documentType === 'materials' && !data.materialVersion
              ? 'This class is archived. This workspace is read-only.'
              : 'This is a historical version, or its class is archived. This workspace is read-only.'}
          </p>
        ) : null}

        {captureReviewContext.isError ? (
          <p role="alert" className="flex flex-wrap items-center gap-2 rounded-[10px] border border-destructive/40 bg-destructive/10 px-3.5 py-2 text-sm text-destructive">
            <span>
              Couldn&apos;t capture the materials version for this review
              {captureReviewContext.error instanceof SeatingApiError
                ? `: ${captureReviewContext.error.message}`
                : '.'}
            </span>
            <button
              type="button"
              onClick={() => captureReviewContext.mutate()}
              className="font-semibold underline underline-offset-2 hover:no-underline"
            >
              Retry
            </button>
          </p>
        ) : null}

        <ReviewControls
          documentType={documentType}
          documentId={documentId}
          reviewState={data.reviewState}
          pageCount={pages.length}
          documentRevision={data.documentRevision}
          allowedActions={data.allowedActions}
          readOnly={data.readOnly}
        />
      </section>

      {pages.length === 0 ? (
        <EmptyDocumentNotice assignmentId={assignmentId} classId={classId} documentType={documentType} documentId={documentId} />
      ) : (
        <section aria-labelledby="page-content-heading" className="space-y-4 rounded-[12px] border border-border bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="page-content-heading" className="font-display text-lg font-medium text-foreground">
              {selectedPage?.label}
            </h2>
            <PageNav pages={pages} selectedPageId={selectedPage?.id ?? ''} onSelect={onSelectedPageIdChange} />
          </div>

          {!isCompleted ? (
            <PageProcessingPlaceholder
              classId={classId}
              assignmentId={assignmentId}
              documentType={documentType}
              documentId={documentId}
              state={selectedPage?.processingState ?? 'uploading'}
            />
          ) : (
            <PageEditorGrid
              // Remounts the editor pane (and its autosave/conflict state)
              // on every page switch, rather than trying to reset internal
              // state in place for what React otherwise treats as the same
              // component instance.
              key={selectedPage.id}
              documentType={documentType}
              documentId={documentId}
              pageId={selectedPage.id}
              readOnly={data.readOnly}
            />
          )}
        </section>
      )}

      {documentType === 'submission' && materialsOpen ? (
        <section aria-labelledby="materials-rail-heading" className="space-y-3 rounded-[12px] border border-border bg-card p-5 shadow-card">
          <div className="flex items-center justify-between gap-2">
            <h2 id="materials-rail-heading" className="font-display text-lg font-medium text-foreground">
              Assignment materials
            </h2>
            <Link
              to="/classes/$classId/assignments/$assignmentId"
              params={{ classId, assignmentId }}
              search={{ q: '', sort: 'studentName', direction: 'asc', page: 1 }}
              className="text-xs font-semibold text-primary hover:underline"
            >
              View assignment
            </Link>
          </div>
          <MaterialsRail materialsVersion={data.reviewContext} />
        </section>
      ) : null}

      {documentType === 'submission' && data.submission ? (
        <GradingRail
          classId={classId}
          assignmentId={assignmentId}
          assignmentName={data.assignment.name}
          assignmentMaxScore={data.assignment.maxScore}
          submission={data.submission}
          pages={pages}
          allowedActions={data.allowedActions}
        />
      ) : null}
    </div>
  );
}

function PageEditorGrid({
  documentType,
  documentId,
  pageId,
  readOnly,
}: {
  documentType: DocumentType;
  documentId: string;
  pageId: string;
  readOnly: boolean;
}) {
  const pageWorkspace = usePageWorkspace(pageId);
  const [pendingRegionInsert, setPendingRegionInsert] = useState<PendingRegionInsert | null>(null);

  if (pageWorkspace.isLoading || !pageWorkspace.data) {
    return <LoadingScreen fullScreen={false} />;
  }
  if (pageWorkspace.error instanceof SeatingApiError) {
    return <p role="alert" className="text-sm text-destructive">{pageWorkspace.error.message}</p>;
  }

  const { page, draft, reviewedAt, readOnly: pageReadOnly } = pageWorkspace.data;
  const effectiveReadOnly = readOnly || pageReadOnly;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <OriginalViewer
          pageId={page.id}
          label={`Original · ${page.label}`}
          canInsertRegion={!effectiveReadOnly}
          onInsertRegion={setPendingRegionInsert}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Transcription · editable
          </span>
          {reviewedAt ? (
            <span className="font-mono text-xs text-primary">Verified {formatDateTime(reviewedAt)}</span>
          ) : null}
        </div>
        <AssignmentEditor
          documentType={documentType}
          documentId={documentId}
          page={page}
          initialDraft={draft}
          readOnly={effectiveReadOnly}
          onReloadLatest={async () => {
            const result = await pageWorkspace.refetch();
            return result.data
              ? { draft: result.data.draft, contentRevision: result.data.page.contentRevision }
              : undefined;
          }}
          pendingRegionInsert={pendingRegionInsert}
          onPendingRegionInsertConsumed={() => setPendingRegionInsert(null)}
        />
        <p className="text-xs text-muted-foreground">
          Teacher edits are the digital version of record. A future retry cannot overwrite them silently.
        </p>
      </div>
    </div>
  );
}

function PageProcessingPlaceholder({
  classId,
  assignmentId,
  documentType,
  documentId,
  state,
}: {
  classId: string;
  assignmentId: string;
  documentType: DocumentType;
  documentId: string;
  state: string;
}) {
  return (
    <div className="space-y-3 rounded-[10px] border border-border bg-muted/30 p-5 text-center">
      <p className="text-sm text-foreground">
        This page is still {state === 'failed' ? 'needing recovery' : 'processing'} ({state}).
      </p>
      <Link
        to="/classes/$classId/assignments/$assignmentId/documents/$documentType/$documentId/processing"
        params={{ classId, assignmentId, documentType, documentId }}
        className="inline-flex min-h-9 items-center rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground hover:bg-pine-ink dark:hover:bg-primary/80"
      >
        Open processing
      </Link>
    </div>
  );
}

function EmptyDocumentNotice({
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
  return (
    <section className="space-y-3 rounded-[12px] border border-border bg-card p-5 text-center shadow-card">
      <p className="text-sm text-muted-foreground">This document has no pages yet.</p>
      <Link
        to="/classes/$classId/assignments/$assignmentId/documents/$documentType/$documentId/upload"
        params={{ classId, assignmentId, documentType, documentId }}
        className="inline-flex min-h-9 items-center rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground hover:bg-pine-ink dark:hover:bg-primary/80"
      >
        Upload pages
      </Link>
    </section>
  );
}
