import type { DocumentType } from '@classprints/assignment-reader-shared';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { GradingStateChip, ReviewStateChip } from '../../components/assignment-reader/status-chips';
import { LoadingScreen } from '../../components/ui/loading-screen';
import { useDocumentAggregate } from '../../hooks/use-assignment-reader';

/**
 * Minimal read-only workspace surface backing the router foundation
 * TASK-019 adds for TASK-023/024 (Ticket 8, "Processing and unified
 * workspace surfaces"). The full page-by-page review/edit and grading UI is
 * built out in that ticket; this placeholder keeps the route navigable now
 * and shows the document's current review/grading rollup.
 */
export function DocumentWorkspacePage({
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
        <h1 className="font-display text-[28px] font-medium leading-tight text-foreground">Workspace</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Review, edit, and grade this document page by page.
        </p>
      </header>

      {isLoading || !data ? (
        <LoadingScreen fullScreen={false} />
      ) : (
        <div className="space-y-3 rounded-[12px] border border-border bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-center gap-3">
            <ReviewStateChip state={data.reviewState} />
            {documentType === 'submission' ? <GradingStateChip state={null} /> : null}
            <span className="text-sm text-muted-foreground">{data.pageCount} pages</span>
          </div>
          {data.readOnly ? (
            <p className="text-sm text-muted-foreground">
              This is a historical version. It is read-only.
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
