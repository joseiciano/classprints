import { useState } from 'react';
import { Plus, UserMinus, UserX, Pencil } from 'lucide-react';
import type { StudentListQuery, StudentRecord } from '@classprints/assignment-reader-shared';
import {
  useCreateStudent,
  useDeleteStudentData,
  useRemoveStudentFromRoster,
  useRenameStudent,
  useStudentsList,
} from '../../hooks/use-assignment-reader';
import { formatDate } from '../../lib/assignment-reader-format';
import { SeatingApiError } from '../../lib/http';
import { Button } from '../ui/button';
import { CanonicalList, type CanonicalListColumn } from './canonical-list';
import { ConfirmActionDialog } from './confirm-action-dialog';
import { NameFormDialog } from './name-form-dialog';

export interface RosterTabSearch {
  q: string;
  sort: NonNullable<StudentListQuery['sort']>;
  direction: NonNullable<StudentListQuery['direction']>;
  page: number;
  status?: StudentListQuery['status'];
}

export const defaultRosterSearch: RosterTabSearch = {
  q: '',
  sort: 'name',
  direction: 'asc',
  page: 1,
  status: 'active',
};

/** Roster management: add, rename, remove, and destructively delete students. */
export function RosterTab({
  classId,
  isArchived,
  search,
  onSearchChange,
}: {
  classId: string;
  isArchived: boolean;
  search: RosterTabSearch;
  onSearchChange: (next: Partial<RosterTabSearch>) => void;
}) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<StudentRecord | null>(null);
  const [removeTarget, setRemoveTarget] = useState<StudentRecord | null>(null);
  const [deleteDataTarget, setDeleteDataTarget] = useState<StudentRecord | null>(null);

  const query: StudentListQuery = {
    q: search.q || undefined,
    sort: search.sort,
    direction: search.direction,
    page: search.page,
    status: search.status,
  };
  const { data, isLoading, isFetching, error, refetch } = useStudentsList(classId, query);
  const createStudent = useCreateStudent(classId);
  const renameStudent = useRenameStudent(classId);
  const removeStudent = useRemoveStudentFromRoster(classId);
  const deleteStudentData = useDeleteStudentData(classId);

  const columns: CanonicalListColumn<StudentRecord>[] = [
    { key: 'name', header: 'Name', sortable: true, render: (row) => <span className="font-medium text-foreground">{row.name}</span> },
    { key: 'createdAt', header: 'Added', sortable: true, render: (row) => formatDate(row.createdAt) },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (row) =>
        row.status === 'active' ? (
          <span className="text-sm text-muted-foreground">Active</span>
        ) : (
          <span className="text-sm text-muted-foreground">Removed</span>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-1">
          <IconButton
            label={`Rename ${row.name}`}
            icon={Pencil}
            disabled={isArchived || row.status !== 'active'}
            onClick={() => setRenameTarget(row)}
          />
          <IconButton
            label={`Remove ${row.name} from roster`}
            icon={UserMinus}
            disabled={isArchived || row.status !== 'active'}
            onClick={() => setRemoveTarget(row)}
          />
          <IconButton
            label={`Delete ${row.name}'s data`}
            icon={UserX}
            tone="destructive"
            onClick={() => setDeleteDataTarget(row)}
          />
        </div>
      ),
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
  ];

  return (
    <div className="space-y-4">
      <CanonicalList<StudentRecord>
        ariaLabel="Roster"
        columns={columns}
        rows={data?.data ?? []}
        getRowId={(row) => row.id}
        search={search.q}
        onSearchChange={(q) => onSearchChange({ q, page: 1 })}
        searchLabel="Search students"
        searchPlaceholder="Search students…"
        sort={search.sort}
        direction={search.direction}
        onSortChange={(sort, direction) =>
          onSearchChange({ sort: sort as RosterTabSearch['sort'], direction, page: 1 })
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
            <p className="font-display text-xl font-medium text-foreground">No students yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">Add your first roster student.</p>
          </>
        }
        noMatchesFor={(value) => (
          <p className="text-sm text-muted-foreground">No students match “{value}”.</p>
        )}
        toolbarEnd={
          <Button type="button" onClick={() => setIsCreateOpen(true)} disabled={isArchived} className="shrink-0">
            <Plus aria-hidden="true" className="h-4 w-4" />
            Add student
          </Button>
        }
      />

      <NameFormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        title="Add a student"
        label="Student name"
        maxLength={120}
        submitLabel="Add student"
        isSubmitting={createStudent.isPending}
        errorMessage={createStudent.error instanceof SeatingApiError ? createStudent.error.message : null}
        onSubmit={(name) =>
          createStudent.mutate(
            { name },
            { onSuccess: () => { setIsCreateOpen(false); createStudent.reset(); } },
          )
        }
      />

      <NameFormDialog
        open={renameTarget !== null}
        onOpenChange={(open) => !open && setRenameTarget(null)}
        title="Rename student"
        label="Student name"
        initialValue={renameTarget?.name}
        maxLength={120}
        submitLabel="Save"
        isSubmitting={renameStudent.isPending}
        errorMessage={renameStudent.error instanceof SeatingApiError ? renameStudent.error.message : null}
        onSubmit={(name) => {
          if (!renameTarget) return;
          renameStudent.mutate(
            { studentId: renameTarget.id, body: { name } },
            { onSuccess: () => { setRenameTarget(null); renameStudent.reset(); } },
          );
        }}
      />

      <ConfirmActionDialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title="Remove from roster?"
        description={
          removeTarget
            ? `${removeTarget.name} will no longer appear on the active roster. Their historical submissions are kept.`
            : ''
        }
        confirmLabel="Remove from roster"
        isSubmitting={removeStudent.isPending}
        errorMessage={removeStudent.error instanceof SeatingApiError ? removeStudent.error.message : null}
        onConfirm={() => {
          if (!removeTarget) return;
          removeStudent.mutate(removeTarget.id, {
            onSuccess: () => { setRemoveTarget(null); removeStudent.reset(); },
          });
        }}
      />

      <ConfirmActionDialog
        open={deleteDataTarget !== null}
        onOpenChange={(open) => !open && setDeleteDataTarget(null)}
        title="Delete this student's data?"
        description={
          deleteDataTarget
            ? `This permanently deletes ${deleteDataTarget.name}'s roster record and every submission and page they created. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete student data"
        tone="destructive"
        isSubmitting={deleteStudentData.isPending}
        errorMessage={
          deleteStudentData.error instanceof SeatingApiError ? deleteStudentData.error.message : null
        }
        onConfirm={() => {
          if (!deleteDataTarget) return;
          deleteStudentData.mutate(deleteDataTarget.id, {
            onSuccess: () => { setDeleteDataTarget(null); deleteStudentData.reset(); },
          });
        }}
      />
    </div>
  );
}

function IconButton({
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
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`inline-grid h-9 w-9 shrink-0 place-items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40 ${
        tone === 'destructive' ? 'text-destructive hover:bg-destructive/10' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}
