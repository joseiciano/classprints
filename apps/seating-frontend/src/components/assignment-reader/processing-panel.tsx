import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { DocumentType } from '@classprints/assignment-reader-shared';
import {
  useAllDocumentProcessing,
  useDocumentWorkspace,
  useRetranscribeDocument,
  useRetryConfirmDocument,
  useRetryPage,
} from '../../hooks/use-assignment-reader';
import { usePageVisible } from '../../hooks/use-page-visibility';
import { replacePageImage } from '../../lib/assignment-reader-api';
import { assignmentReaderKeys } from '../../lib/assignment-reader-query-keys';
import { SeatingApiError } from '../../lib/http';
import { LoadingScreen } from '../ui/loading-screen';
import { ProcessingDetailView } from './processing-detail-view';
import { ProcessingStateChip } from './status-chips';

/**
 * The live processing surface (TASK-023): the canonical, complete current
 * page set plus the per-document recovery/retranscription detail (see
 * `ProcessingDetailView`). Polls every 3000 ms, but only while the tab is
 * visible and the document hasn't reached `completed`
 * (`processingRefetchInterval`).
 */
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
  const navigate = useNavigate();
  const visible = usePageVisible();
  const workspace = useDocumentWorkspace(documentType, documentId);

  const processing = useAllDocumentProcessing(documentType, documentId, visible);

  const relatedKeys = [assignmentReaderKeys.documents.processing(documentType, documentId, {})];
  const retryPage = useRetryPage(documentType, documentId, relatedKeys);
  const retranscribe = useRetranscribeDocument(documentType, documentId, relatedKeys);
  const retryConfirm = useRetryConfirmDocument(documentType, documentId, relatedKeys);
  const queryClient = useQueryClient();
  const replacePage = useMutation({
    mutationFn: ({ pageId, file }: { pageId: string; file: File }) => replacePageImage(pageId, file),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: assignmentReaderKeys.documents.aggregate(documentType, documentId),
      });
    },
  });

  if (processing.isLoading || !processing.data || workspace.isLoading || !workspace.data) {
    return <LoadingScreen fullScreen={false} />;
  }

  const anyPageEditedByTeacher = processing.data.data.some((page) => page.editedByTeacher);

  return (
    <section className="space-y-6">
      <div className="space-y-2 rounded-[12px] border border-border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-medium text-foreground">Document state</h2>
            <p className="text-sm text-muted-foreground">Processing and review stay separate.</p>
          </div>
          <ProcessingStateChip state={processing.data.processingState} />
        </div>
        <p className="text-sm text-muted-foreground">
          {processing.data.processingCounts.completed} / {processing.data.processingCounts.total} pages
          completed
          {processing.data.processingCounts.failed > 0 ? ` · ${processing.data.processingCounts.failed} failed` : ''}
        </p>
        <p className="text-xs text-muted-foreground">
          A document enters Needs review only after every current page has an editable draft. Ready to
          grade still requires teacher verification.
        </p>
      </div>

      <section className="space-y-4 rounded-[12px] border border-border bg-card p-5 shadow-card">
        <h2 className="font-display text-xl font-medium text-foreground">Pages</h2>
        <ProcessingDetailView
          response={processing.data}
          readOnly={workspace.data.readOnly}
          onReviewPage={(pageId) =>
            void navigate({
              to: '/classes/$classId/assignments/$assignmentId/documents/$documentType/$documentId/workspace',
              params: { classId, assignmentId, documentType, documentId },
              search: { pageId },
            })
          }
          onRetryPage={(pageId) => retryPage.mutate(pageId)}
          onReplacePage={(pageId, file) => replacePage.mutate({ pageId, file })}
          onRetranscribe={(body) => retranscribe.mutate(body)}
          onRetryConfirmDelivery={() => retryConfirm.mutate()}
          retryPendingPageId={retryPage.isPending ? (retryPage.variables ?? null) : null}
          replacePendingPageId={replacePage.isPending ? (replacePage.variables?.pageId ?? null) : null}
          retranscribeControls={{
            hasTeacherEdits: anyPageEditedByTeacher,
            hasQuestionJudgments: documentType === 'submission',
            documentRevision: workspace.data.documentRevision,
          }}
        />
        {retryPage.error instanceof SeatingApiError ? (
          <p role="alert" className="text-sm text-destructive">{retryPage.error.message}</p>
        ) : null}
        {replacePage.error instanceof SeatingApiError ? (
          <p role="alert" className="text-sm text-destructive">{replacePage.error.message}</p>
        ) : null}
        {retranscribe.error instanceof SeatingApiError ? (
          <p role="alert" className="text-sm text-destructive">{retranscribe.error.message}</p>
        ) : null}
        {retryConfirm.error instanceof SeatingApiError ? (
          <p role="alert" className="text-sm text-destructive">{retryConfirm.error.message}</p>
        ) : null}
      </section>
    </section>
  );
}
