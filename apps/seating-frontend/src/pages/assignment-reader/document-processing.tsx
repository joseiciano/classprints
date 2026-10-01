import type { DocumentType } from '@classprints/assignment-reader-shared';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { ProcessingStateChip } from '../../components/assignment-reader/status-chips';
import { LoadingScreen } from '../../components/ui/loading-screen';
import { useDocumentAggregate } from '../../hooks/use-assignment-reader';

/**
 * Minimal live processing surface backing the router foundation TASK-019
 * adds for TASK-023 (Ticket 8, "Processing and unified workspace surfaces").
 * It shows the document's current rollup so a teacher always has somewhere
 * to land while a page finishes transcribing; the full per-page progress
 * list, retry, and replace UI are built out in that ticket.
 */
export function DocumentProcessingPage({
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
  const { data, isLoading } = useDocumentAggregate(documentType, documentId);

  return (
    <section className="space-y-6">
      <BackLink classId={classId} assignmentId={assignmentId} />
      <header>
        <h1 className="font-display text-[28px] font-medium leading-tight text-foreground">
          Processing
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Transcription is running in the background. This page updates automatically.
        </p>
      </header>

      {isLoading || !data ? (
        <LoadingScreen fullScreen={false} />
      ) : (
        <div className="space-y-3 rounded-[12px] border border-border bg-card p-5 shadow-card">
          <div className="flex items-center gap-3">
            <ProcessingStateChip state={data.processingState} />
            <span className="text-sm text-muted-foreground">
              {data.processingCounts.completed} / {data.processingCounts.total} pages completed
            </span>
          </div>
          {data.processingCounts.failed > 0 ? (
            <p className="text-sm text-destructive">
              {data.processingCounts.failed} page{data.processingCounts.failed === 1 ? '' : 's'} failed and can be retried.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function BackLink({ classId, assignmentId }: { classId: string; assignmentId: string }) {
  return (
    <Link
      to="/classes/$classId/assignments/$assignmentId"
      params={{ classId, assignmentId }}
      className="inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      Back to assignment
    </Link>
  );
}
