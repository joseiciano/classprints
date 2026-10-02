import type { DocumentType } from '@classprints/assignment-reader-shared';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { ProcessingPanel } from '../../components/assignment-reader/processing-panel';
import { defaultSubmissionsSearch } from '../../components/assignment-reader/submissions-panel';
import { LoadingScreen } from '../../components/ui/loading-screen';
import { useDocumentWorkspace } from '../../hooks/use-assignment-reader';

/**
 * Live per-document processing surface (TASK-023, Ticket 8). Transcription
 * runs in the background per page; this route polls the canonical
 * processing table while visible and anything is still running, and gives a
 * completed page's "Review now" action without waiting for every sibling
 * page, per-page retry/replace, and the explicit whole-document
 * retranscription path.
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
  const { data, isLoading } = useDocumentWorkspace(documentType, documentId);

  const title =
    documentType === 'materials'
      ? `Processing ${data?.assignment.name ?? 'materials'}`
      : `Processing ${data?.student?.name ?? 'submission'}`;

  return (
    <section className="space-y-6">
      <BackLink classId={classId} assignmentId={assignmentId} />
      <header>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.assignment.name} · ${data.student?.name ?? 'Materials'}` : 'Live document progress'}
        </p>
        <h1 className="font-display text-[28px] font-medium leading-tight text-foreground">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Pages transcribe independently. Completed pages can be reviewed immediately; this page updates
          automatically while anything is still processing.
        </p>
      </header>

      {isLoading || !data ? (
        <LoadingScreen fullScreen={false} />
      ) : (
        <ProcessingPanel
          classId={classId}
          assignmentId={assignmentId}
          documentType={documentType}
          documentId={documentId}
        />
      )}
    </section>
  );
}

function BackLink({ classId, assignmentId }: { classId: string; assignmentId: string }) {
  return (
    <Link
      to="/classes/$classId/assignments/$assignmentId"
      params={{ classId, assignmentId }}
      search={defaultSubmissionsSearch}
      className="inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      Back to assignment
    </Link>
  );
}
