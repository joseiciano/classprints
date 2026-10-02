import type { DocumentType } from '@classprints/assignment-reader-shared';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { WorkspacePanel } from '../../components/assignment-reader/workspace/workspace-panel';
import { defaultSubmissionsSearch } from '../../components/assignment-reader/submissions-panel';

/**
 * The unified materials/submission workspace route (TASK-025, Ticket 8):
 * review, correct, and — for a submission — grade a document without ever
 * leaving this screen. See `WorkspacePanel` for the actual composition.
 */
export function DocumentWorkspacePage({
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
  return (
    <section className="space-y-6">
      <BackLink classId={classId} assignmentId={assignmentId} />
      <WorkspacePanel
        classId={classId}
        assignmentId={assignmentId}
        documentType={documentType}
        documentId={documentId}
        selectedPageId={selectedPageId}
        onSelectedPageIdChange={onSelectedPageIdChange}
      />
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
