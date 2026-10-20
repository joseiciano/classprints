import type { DocumentAction, DocumentType } from '@classprints/assignment-reader-shared';
import { useMarkDocumentReady, useReturnToNeedsReview } from '../../../hooks/use-assignment-reader';
import { SeatingApiError } from '../../../lib/http';
import { Button } from '../../ui/button';
import { ReviewStateChip } from '../status-chips';

/**
 * The document-level review meta bar (TASK-025/REQ-016/REQ-017): readiness
 * is a separate, explicit transition from "every page completed", and this
 * only ever offers the action the server's own `allowedActions` already
 * allows — it never re-derives that gate client-side. Shared by both
 * materials and submission workspaces; submission grading itself lives in
 * `GradingRail`, not here.
 */
export function ReviewControls({
  documentType,
  documentId,
  reviewState,
  pageCount,
  documentRevision,
  allowedActions,
  readOnly,
}: {
  documentType: DocumentType;
  documentId: string;
  reviewState: import('@classprints/assignment-reader-shared').ReviewState | null;
  pageCount: number;
  documentRevision: number;
  allowedActions: DocumentAction[];
  readOnly: boolean;
}) {
  const markReady = useMarkDocumentReady(documentType, documentId);
  const returnToNeedsReview = useReturnToNeedsReview(documentType, documentId);
  const canMarkReady = allowedActions.includes('mark_ready');
  const canReturn = allowedActions.includes('return_to_needs_review');

  return (
    <div className="flex flex-wrap items-center gap-3">
      <ReviewStateChip state={reviewState} />
      <span className="text-sm text-muted-foreground">
        {pageCount} page{pageCount === 1 ? '' : 's'}
      </span>
      {!readOnly && (canMarkReady || canReturn) ? (
        <div className="ml-auto flex gap-2">
          {canMarkReady ? (
            <Button
              type="button"
              size="sm"
              disabled={markReady.isPending}
              onClick={() => markReady.mutate({ expectedDocumentRevision: documentRevision })}
            >
              Mark ready to grade
            </Button>
          ) : null}
          {canReturn ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={returnToNeedsReview.isPending}
              onClick={() => returnToNeedsReview.mutate({ expectedDocumentRevision: documentRevision })}
            >
              Return to Needs review
            </Button>
          ) : null}
        </div>
      ) : null}
      {markReady.error instanceof SeatingApiError ? (
        <p role="alert" className="w-full text-sm text-destructive">{markReady.error.message}</p>
      ) : null}
      {returnToNeedsReview.error instanceof SeatingApiError ? (
        <p role="alert" className="w-full text-sm text-destructive">{returnToNeedsReview.error.message}</p>
      ) : null}
    </div>
  );
}
