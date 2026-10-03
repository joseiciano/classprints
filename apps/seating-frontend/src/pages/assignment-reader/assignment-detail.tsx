import { useState } from 'react';
import { Link, getRouteApi, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { AssignmentFormDialog } from '../../components/assignment-reader/assignment-form-dialog';
import { ConfirmActionDialog } from '../../components/assignment-reader/confirm-action-dialog';
import { MaterialsPanel } from '../../components/assignment-reader/materials-panel';
import { AssignmentStatusChip } from '../../components/assignment-reader/status-chips';
import { SubmissionsPanel } from '../../components/assignment-reader/submissions-panel';
import { LoadingScreen } from '../../components/ui/loading-screen';
import {
  useAssignment,
  useDeleteAssignment,
  useUpdateAssignment,
} from '../../hooks/use-assignment-reader';
import { SeatingApiError } from '../../lib/http';
import { defaultClassDashboardSearch, type SubmissionsSearch } from '../../lib/assignment-reader-search';

export function AssignmentDetailPage({
  classId,
  assignmentId,
  submissionsSearch,
  onSubmissionsSearchChange,
}: {
  classId: string;
  assignmentId: string;
  submissionsSearch: SubmissionsSearch;
  onSubmissionsSearchChange: (next: Partial<SubmissionsSearch>) => void;
}) {
  const navigate = useNavigate();
  const { data: assignment, isLoading, error, refetch } = useAssignment(assignmentId);
  const updateAssignment = useUpdateAssignment(assignmentId, classId);
  const deleteAssignment = useDeleteAssignment(assignmentId, classId);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  if (isLoading) {
    return <LoadingScreen fullScreen={false} />;
  }

  if (!assignment) {
    return (
      <section className="space-y-5">
        <BackLink classId={classId} />
        <div className="rounded-[12px] border border-border bg-card p-6 shadow-card">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-destructive">
            Assignment unavailable
          </p>
          <h1 className="mt-2 font-display text-[28px] font-medium leading-tight">
            We could not load this assignment.
          </h1>
          {error instanceof SeatingApiError ? (
            <p className="mt-3 text-sm text-destructive">{error.message}</p>
          ) : null}
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-5 min-h-11 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  const isArchived = assignment.classStatus === 'archived';

  return (
    <section className="space-y-6">
      <BackLink classId={classId} />

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{assignment.className}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2.5">
            <h1 className="truncate font-display text-[32px] font-medium leading-tight text-foreground">
              {assignment.name}
            </h1>
            <AssignmentStatusChip status={assignment.status} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {assignment.maxScore !== null ? `Out of ${assignment.maxScore} points` : 'No maximum score'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <HeaderButton label="Edit assignment" icon={Pencil} disabled={isArchived} onClick={() => setIsEditOpen(true)} />
          <HeaderButton label="Delete assignment" icon={Trash2} tone="destructive" onClick={() => setIsDeleteOpen(true)} />
        </div>
      </header>

      {isArchived ? (
        <p role="status" className="rounded-[10px] border border-border bg-muted px-4 py-2.5 text-sm text-muted-foreground">
          This class is archived. Editing is disabled except for destructive deletion.
        </p>
      ) : null}

      <MaterialsPanel
        classId={classId}
        assignmentId={assignmentId}
        assignment={assignment}
        isArchived={isArchived}
      />

      <SubmissionsPanel
        classId={classId}
        assignmentId={assignmentId}
        isArchived={isArchived}
        search={submissionsSearch}
        onSearchChange={onSubmissionsSearchChange}
      />

      <AssignmentFormDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        mode="rename"
        initialName={assignment.name}
        initialMaxScore={assignment.maxScore}
        isSubmitting={updateAssignment.isPending}
        errorMessage={updateAssignment.error instanceof SeatingApiError ? updateAssignment.error.message : null}
        onSubmit={(values) =>
          updateAssignment.mutate(values, { onSuccess: () => setIsEditOpen(false) })
        }
      />

      <ConfirmActionDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Delete this assignment?"
        description="This permanently deletes the assignment, its materials, and every submission and page attached to it. This cannot be undone."
        confirmLabel="Delete assignment"
        tone="destructive"
        isSubmitting={deleteAssignment.isPending}
        errorMessage={deleteAssignment.error instanceof SeatingApiError ? deleteAssignment.error.message : null}
        onConfirm={() =>
          deleteAssignment.mutate(undefined, {
            onSuccess: () =>
              void navigate({
                to: '/classes/$classId',
                params: { classId },
                search: defaultClassDashboardSearch,
              }),
          })
        }
      />
    </section>
  );
}

function BackLink({ classId }: { classId: string }) {
  return (
    <Link
      to="/classes/$classId"
      params={{ classId }}
      search={defaultClassDashboardSearch}
      className="inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      Back to class
    </Link>
  );
}

function HeaderButton({
  label,
  icon: Icon,
  onClick,
  disabled,
  tone,
}: {
  label: string;
  icon: typeof Pencil;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'destructive';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40 ${
        tone === 'destructive'
          ? 'border-destructive/30 bg-card text-destructive hover:border-destructive'
          : 'border-border bg-card text-foreground hover:border-primary'
      }`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

const assignmentDetailRouteApi = getRouteApi('/_app/classes/$classId/assignments/$assignmentId');

export function AssignmentDetailRoute() {
  const { classId, assignmentId } = assignmentDetailRouteApi.useParams();
  const search = assignmentDetailRouteApi.useSearch();
  const navigate = assignmentDetailRouteApi.useNavigate();
  return (
    <AssignmentDetailPage
      classId={classId}
      assignmentId={assignmentId}
      submissionsSearch={search}
      onSubmissionsSearchChange={(next) =>
        void navigate({ search: (prev) => ({ ...prev, ...next }) })
      }
    />
  );
}
