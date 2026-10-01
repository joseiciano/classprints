import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import type { AssignmentListItem, AssignmentListQuery } from '@classprints/assignment-reader-shared';
import { useAssignmentsList, useCreateAssignment } from '../../hooks/use-assignment-reader';
import { formatDate } from '../../lib/assignment-reader-format';
import { SeatingApiError } from '../../lib/http';
import { Button } from '../ui/button';
import { AssignmentFormDialog } from './assignment-form-dialog';
import { CanonicalList, type CanonicalListColumn } from './canonical-list';
import { AssignmentStatusChip } from './status-chips';

export interface AssignmentsTabSearch {
  q: string;
  sort: NonNullable<AssignmentListQuery['sort']>;
  direction: NonNullable<AssignmentListQuery['direction']>;
  page: number;
  status?: AssignmentListQuery['status'];
}

export const defaultAssignmentsSearch: AssignmentsTabSearch = {
  q: '',
  sort: 'createdAt',
  direction: 'desc',
  page: 1,
};

export function AssignmentsTab({
  classId,
  isArchived,
  search,
  onSearchChange,
}: {
  classId: string;
  isArchived: boolean;
  search: AssignmentsTabSearch;
  onSearchChange: (next: Partial<AssignmentsTabSearch>) => void;
}) {
  const navigate = useNavigate();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const query: AssignmentListQuery = {
    q: search.q || undefined,
    sort: search.sort,
    direction: search.direction,
    page: search.page,
    status: search.status,
  };
  const { data, isLoading, isFetching, error, refetch } = useAssignmentsList(classId, query);
  const createAssignment = useCreateAssignment(classId);

  const columns: CanonicalListColumn<AssignmentListItem>[] = [
    { key: 'createdAt', header: 'Date', sortable: true, render: (row) => formatDate(row.createdAt) },
    {
      key: 'name',
      header: 'Assignment',
      sortable: true,
      render: (row) => <span className="font-medium text-foreground">{row.name}</span>,
    },
    { key: 'status', header: 'Status', sortable: true, render: (row) => <AssignmentStatusChip status={row.status} /> },
  ];

  return (
    <div className="space-y-4">
      <CanonicalList<AssignmentListItem>
        ariaLabel="Assignments"
        columns={columns}
        rows={data?.data ?? []}
        getRowId={(row) => row.id}
        onRowActivate={(row) =>
          void navigate({
            to: '/classes/$classId/assignments/$assignmentId',
            params: { classId, assignmentId: row.id },
          })
        }
        rowAriaLabel={(row) => `Open assignment ${row.name}`}
        search={search.q}
        onSearchChange={(q) => onSearchChange({ q, page: 1 })}
        searchLabel="Search assignments"
        searchPlaceholder="Search assignments…"
        sort={search.sort}
        direction={search.direction}
        onSortChange={(sort, direction) =>
          onSearchChange({ sort: sort as AssignmentsTabSearch['sort'], direction, page: 1 })
        }
        page={search.page}
        totalPages={data?.pagination.totalPages ?? 0}
        totalItems={data?.pagination.totalItems ?? 0}
        onPageChange={(page) => onSearchChange({ page })}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={() => void refetch()}
        emptyState={
          <>
            <p className="font-display text-xl font-medium text-foreground">No assignments yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">Create your first assignment for this class.</p>
          </>
        }
        noMatchesFor={(value) => (
          <p className="text-sm text-muted-foreground">No assignments match “{value}”.</p>
        )}
        toolbarEnd={
          <Button type="button" onClick={() => setIsCreateOpen(true)} disabled={isArchived} className="shrink-0">
            <Plus aria-hidden="true" className="h-4 w-4" />
            New assignment
          </Button>
        }
      />

      <AssignmentFormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        mode="create"
        isSubmitting={createAssignment.isPending}
        errorMessage={
          createAssignment.error instanceof SeatingApiError ? createAssignment.error.message : null
        }
        onSubmit={(values) =>
          createAssignment.mutate(values, {
            onSuccess: (created) => {
              setIsCreateOpen(false);
              createAssignment.reset();
              void navigate({
                to: '/classes/$classId/assignments/$assignmentId',
                params: { classId, assignmentId: created.id },
              });
            },
          })
        }
      />
    </div>
  );
}
