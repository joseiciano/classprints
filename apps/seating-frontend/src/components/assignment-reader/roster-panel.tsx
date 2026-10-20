import { useState } from 'react';
import type { StudentListQuery, StudentRecord } from '@classprints/assignment-reader-shared';
import {
  useCreateStudent,
  useDeleteStudentData,
  useRemoveStudentFromRoster,
  useRenameStudent,
  useStudentsList,
} from '../../hooks/use-assignment-reader';
import { SeatingApiError } from '../../lib/http';
import type { RosterPanelSearch } from '../../lib/assignment-reader-search';
import { ConfirmActionDialog } from './confirm-action-dialog';
import { NameFormDialog } from './name-form-dialog';
import { RosterPanelView } from './roster-panel-view';

/**
 * Roster management: add, rename, remove, and destructively delete
 * students. The roster is a full `StudentListQuery` (REQ-003) — search,
 * sortable columns, a status filter, and pagination all reach the server —
 * rather than a client-side truncation to the first page of active
 * students, so `search`/`onSearchChange` round-trip through the caller the
 * same way `AssignmentsTab`/`SubmissionsPanel` do.
 */
export function RosterPanel({
  classId,
  isArchived,
  search,
  onSearchChange,
}: {
  classId: string;
  isArchived: boolean;
  search: RosterPanelSearch;
  onSearchChange: (next: Partial<RosterPanelSearch>) => void;
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

  return (
    <div>
      <RosterPanelView
        students={data?.data ?? []}
        readOnly={isArchived}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={() => void refetch()}
        onAddStudent={() => setIsCreateOpen(true)}
        onRenameStudent={setRenameTarget}
        onRemoveStudent={setRemoveTarget}
        onDeleteStudentData={setDeleteDataTarget}
        search={search.q}
        onSearchChange={(q) => onSearchChange({ q, page: 1 })}
        sort={search.sort}
        direction={search.direction}
        onSortChange={(sort, direction) =>
          onSearchChange({ sort: sort as RosterPanelSearch['sort'], direction, page: 1 })
        }
        page={search.page}
        totalPages={data?.pagination.totalPages ?? 0}
        totalItems={data?.pagination.totalItems ?? 0}
        onPageChange={(page) => onSearchChange({ page })}
        statusFilter={search.status}
        onStatusFilterChange={(status) => onSearchChange({ status, page: 1 })}
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
