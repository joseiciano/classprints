import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { FileStack, Plus, Trash2, Upload } from 'lucide-react';
import type { AssignmentRecord, MaterialVersionSummary } from '@classprints/assignment-reader-shared';
import {
  useCreateDraftMaterialVersion,
  useDeleteAssignmentMaterials,
  useMaterialVersionsList,
} from '../../hooks/use-assignment-reader';
import { formatDateTime } from '../../lib/assignment-reader-format';
import { SeatingApiError } from '../../lib/http';
import { Button } from '../ui/button';
import { ConfirmActionDialog } from './confirm-action-dialog';
import { ProcessingStateChip, ReviewStateChip } from './status-chips';

function documentRouteFor(
  classId: string,
  assignmentId: string,
  version: Pick<MaterialVersionSummary, 'id' | 'lifecycle' | 'processingState' | 'pageCount'>,
) {
  if (version.lifecycle === 'draft' || version.pageCount === 0) {
    return {
      to: '/classes/$classId/assignments/$assignmentId/documents/$documentType/$documentId/upload' as const,
      params: { classId, assignmentId, documentType: 'materials', documentId: version.id },
    };
  }
  if (version.processingState !== 'completed') {
    return {
      to: '/classes/$classId/assignments/$assignmentId/documents/$documentType/$documentId/processing' as const,
      params: { classId, assignmentId, documentType: 'materials', documentId: version.id },
    };
  }
  return {
    to: '/classes/$classId/assignments/$assignmentId/documents/$documentType/$documentId/workspace' as const,
    params: { classId, assignmentId, documentType: 'materials', documentId: version.id },
  };
}

export function MaterialsPanel({
  classId,
  assignmentId,
  assignment,
  isArchived,
}: {
  classId: string;
  assignmentId: string;
  assignment: AssignmentRecord;
  isArchived: boolean;
}) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useMaterialVersionsList(assignmentId, page);
  const createDraft = useCreateDraftMaterialVersion(assignmentId);
  const deleteMaterials = useDeleteAssignmentMaterials(assignmentId);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const versions = data?.data ?? [];
  const totalPages = data?.pagination.totalPages ?? 0;
  const totalItems = data?.pagination.totalItems ?? 0;
  const draft = versions.find((version) => version.lifecycle === 'draft');
  const current = assignment.currentMaterialVersion;
  const hasAnyMaterials = versions.length > 0;

  const handleReplace = () => {
    if (draft) {
      void navigate(documentRouteFor(classId, assignmentId, draft));
      return;
    }
    createDraft.mutate(undefined, {
      onSuccess: (created) => void navigate(documentRouteFor(classId, assignmentId, created)),
    });
  };

  return (
    <section className="space-y-4 rounded-[12px] border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-medium text-foreground">Materials</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isArchived || createDraft.isPending}
            onClick={handleReplace}
          >
            {current ? <Upload aria-hidden="true" className="h-4 w-4" /> : <Plus aria-hidden="true" className="h-4 w-4" />}
            {draft ? 'Resume upload' : current ? 'Replace materials' : 'Add materials'}
          </Button>
          {hasAnyMaterials ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setIsDeleteOpen(true)}
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              Delete materials
            </Button>
          ) : null}
        </div>
      </div>

      {createDraft.error instanceof SeatingApiError ? (
        <p role="alert" className="text-sm text-destructive">{createDraft.error.message}</p>
      ) : null}

      {current ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-border bg-background px-4 py-3">
          <FileStack aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">
              Version {current.version} · {current.pageCount} page{current.pageCount === 1 ? '' : 's'}
            </p>
            <p className="text-xs text-muted-foreground">
              Confirmed {formatDateTime(current.confirmedAt)}
            </p>
          </div>
          <ProcessingStateChip state={current.processingState} />
          <ReviewStateChip state={current.reviewState} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void navigate(documentRouteFor(classId, assignmentId, current))}
          >
            View
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No materials uploaded yet.</p>
      )}

      {!isLoading && versions.length > 0 ? (
        <div>
          <h3 className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Version history
          </h3>
          <ul className="space-y-1.5">
            {versions.map((version) => (
              <li key={version.id}>
                <button
                  type="button"
                  onClick={() => void navigate(documentRouteFor(classId, assignmentId, version))}
                  className="flex w-full items-center justify-between gap-3 rounded-[10px] border border-border bg-background px-3.5 py-2.5 text-left text-sm transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="min-w-0 flex-1 truncate">
                    Version {version.version}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {version.lifecycle === 'draft'
                        ? 'Draft'
                        : version.lifecycle === 'current'
                          ? 'Current'
                          : 'Historical (read-only)'}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{version.pageCount} pages</span>
                  <ProcessingStateChip state={version.processingState} />
                </button>
              </li>
            ))}
          </ul>

          {totalPages > 1 ? (
            <nav
              aria-label="Version history pagination"
              className="mt-3 flex items-center justify-between gap-3 text-sm text-muted-foreground"
            >
              <span>
                Page {page} of {totalPages} · {totalItems.toLocaleString()} total
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </nav>
          ) : null}
        </div>
      ) : null}

      {error ? <p role="alert" className="text-sm text-destructive">Unable to load material versions.</p> : null}

      <ConfirmActionDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Delete all materials?"
        description="This permanently deletes the draft, current, and every historical materials version and their pages. Submissions are not affected. This cannot be undone."
        confirmLabel="Delete materials"
        tone="destructive"
        isSubmitting={deleteMaterials.isPending}
        errorMessage={deleteMaterials.error instanceof SeatingApiError ? deleteMaterials.error.message : null}
        onConfirm={() =>
          deleteMaterials.mutate(undefined, {
            onSuccess: () => { setIsDeleteOpen(false); setPage(1); },
          })
        }
      />
    </section>
  );
}
