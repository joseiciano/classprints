import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import type { SubmissionListItem, SubmissionListQuery } from '@classprints/assignment-reader-shared';
import {
  useCreateOrReturnSubmission,
  useDeleteSubmission,
  useSubmissionsList,
} from '../../hooks/use-assignment-reader';
import { formatDate } from '../../lib/assignment-reader-format';
import { SeatingApiError } from '../../lib/http';
import type { SubmissionsSearch } from '../../lib/assignment-reader-search';
import { CanonicalList, type CanonicalListColumn } from './canonical-list';
import { ConfirmActionDialog } from './confirm-action-dialog';
import { SubmissionStatusChip } from './status-chips';

const STATUS_OPTIONS: { value: SubmissionListQuery['status']; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'not_started', label: 'Not started' },
  { value: 'uploading', label: 'Uploading' },
  { value: 'queued', label: 'Queued' },
  { value: 'transcribing', label: 'Transcribing' },
  { value: 'error', label: 'Error' },
  { value: 'needs_review', label: 'Needs review' },
  { value: 'ready_to_grade', label: 'Ready to grade' },
  { value: 'graded', label: 'Graded' },
];

function routeForSubmission(
  classId: string,
  assignmentId: string,
  submissionId: string,
  status: SubmissionListItem['displayStatus'],
) {
  const base = {
    classId,
    assignmentId,
    documentType: 'submission' as const,
    documentId: submissionId,
  };
  if (status === 'uploading') {
    return {
      to: '/classes/$classId/assignments/$assignmentId/documents/$documentType/$documentId/upload' as const,
      params: base,
    };
  }
  if (status === 'queued' || status === 'transcribing' || status === 'error') {
    return {
      to: '/classes/$classId/assignments/$assignmentId/documents/$documentType/$documentId/processing' as const,
      params: base,
    };
  }
  return {
    to: '/classes/$classId/assignments/$assignmentId/documents/$documentType/$documentId/workspace' as const,
    params: base,
  };
}

export function SubmissionsPanel({
  classId,
  assignmentId,
  isArchived,
  search,
  onSearchChange,
}: {
  classId: string;
  assignmentId: string;
  isArchived: boolean;
  search: SubmissionsSearch;
  onSearchChange: (next: Partial<SubmissionsSearch>) => void;
}) {
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState<SubmissionListItem | null>(null);

  const query: SubmissionListQuery = {
    q: search.q || undefined,
    sort: search.sort,
    direction: search.direction,
    page: search.page,
    status: search.status,
  };
  const { data, isLoading, isFetching, error, refetch } = useSubmissionsList(assignmentId, query);
  const createSubmission = useCreateOrReturnSubmission(assignmentId);
  const deleteSubmission = useDeleteSubmission(deleteTarget?.submissionId ?? '', assignmentId);

  const handleActivate = (row: SubmissionListItem) => {
    if (row.displayStatus === 'not_started') {
      if (isArchived) return;
      createSubmission.mutate(row.studentId, {
        onSuccess: (result) =>
          void navigate(
            routeForSubmission(classId, assignmentId, result.submission.id, 'uploading'),
          ),
      });
      return;
    }
    if (!row.submissionId) return;
    void navigate(routeForSubmission(classId, assignmentId, row.submissionId, row.displayStatus));
  };

  const columns: CanonicalListColumn<SubmissionListItem>[] = [
    { key: 'createdAt', header: 'Date', sortable: true, render: (row) => formatDate(row.createdAt) },
    {
      key: 'studentName',
      header: 'Name',
      sortable: true,
      render: (row) => <span className="font-medium text-foreground">{row.studentName}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (row) => <SubmissionStatusChip status={row.displayStatus} />,
    },
    {
      key: 'actions',
      header: '',
      render: (row) =>
        row.submissionId ? (
          <button
            type="button"
            aria-label={`Delete ${row.studentName}'s submission`}
            title="Delete submission"
            onClick={(event) => {
              event.stopPropagation();
              setDeleteTarget(row);
            }}
            className="inline-grid h-9 w-9 place-items-center rounded-full text-destructive transition hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </button>
        ) : null,
      headerClassName: 'w-12',
      cellClassName: 'text-right',
    },
  ];

  return (
    <section className="space-y-4 rounded-[12px] border border-border bg-card p-5 shadow-card">
      <h2 className="font-display text-xl font-medium text-foreground">Submissions</h2>
      <CanonicalList<SubmissionListItem>
        ariaLabel="Submissions"
        columns={columns}
        rows={data?.data ?? []}
        getRowId={(row) => row.studentId}
        onRowActivate={handleActivate}
        rowAriaLabel={(row) => `Open ${row.studentName}'s submission, status ${row.displayStatus}`}
        search={search.q}
        onSearchChange={(q) => onSearchChange({ q, page: 1 })}
        searchLabel="Search submissions"
        searchPlaceholder="Search by name or status…"
        sort={search.sort}
        direction={search.direction}
        onSortChange={(sort, direction) =>
          onSearchChange({ sort: sort as SubmissionsSearch['sort'], direction, page: 1 })
        }
        page={search.page}
        totalPages={data?.pagination.totalPages ?? 0}
        totalItems={data?.pagination.totalItems ?? 0}
        onPageChange={(page) => onSearchChange({ page })}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={() => void refetch()}
        emptyState={<p className="text-sm text-muted-foreground">No roster students yet.</p>}
        noMatchesFor={(value) => (
          <p className="text-sm text-muted-foreground">No submissions match “{value}”.</p>
        )}
        filters={
          <select
            aria-label="Filter by status"
            value={search.status ?? ''}
            onChange={(event) =>
              onSearchChange({
                status: (event.target.value || undefined) as SubmissionListQuery['status'],
                page: 1,
              })
            }
            className="min-h-9 rounded-full border border-border bg-card px-3 text-[13px] font-medium text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.label} value={option.value ?? ''}>
                {option.label}
              </option>
            ))}
          </select>
        }
      />

      <ConfirmActionDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this submission?"
        description={
          deleteTarget
            ? `This permanently deletes ${deleteTarget.studentName}'s submission and every page, review, and grade on it. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete submission"
        tone="destructive"
        isSubmitting={deleteSubmission.isPending}
        errorMessage={deleteSubmission.error instanceof SeatingApiError ? deleteSubmission.error.message : null}
        onConfirm={() => deleteSubmission.mutate(undefined, { onSuccess: () => setDeleteTarget(null) })}
      />
    </section>
  );
}
