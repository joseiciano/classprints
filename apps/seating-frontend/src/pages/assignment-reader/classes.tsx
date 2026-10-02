import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import type { ClassListQuery, ClassRecord } from '@classprints/assignment-reader-shared';
import { CanonicalList, type CanonicalListColumn } from '../../components/assignment-reader/canonical-list';
import { ClassFormDialog } from '../../components/assignment-reader/class-form-dialog';
import { ClassStatusChip } from '../../components/assignment-reader/status-chips';
import { Button } from '../../components/ui/button';
import { useClassesList, useCreateClass } from '../../hooks/use-assignment-reader';
import { SeatingApiError } from '../../lib/http';
import { formatDate } from '../../lib/assignment-reader-format';
import { defaultClassDashboardSearch } from './class-dashboard';

export interface ClassesSearch {
  q: string;
  sort: NonNullable<ClassListQuery['sort']>;
  direction: NonNullable<ClassListQuery['direction']>;
  page: number;
  status?: ClassListQuery['status'];
}

export const defaultClassesSearch: ClassesSearch = {
  q: '',
  sort: 'createdAt',
  direction: 'desc',
  page: 1,
};

export function ClassesPage({
  search,
  onSearchChange,
}: {
  search: ClassesSearch;
  onSearchChange: (next: Partial<ClassesSearch>) => void;
}) {
  const navigate = useNavigate();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const query: ClassListQuery = {
    q: search.q || undefined,
    sort: search.sort,
    direction: search.direction,
    page: search.page,
    status: search.status,
  };
  const { data, isLoading, isFetching, error, refetch } = useClassesList(query);
  const createClass = useCreateClass();

  const columns: CanonicalListColumn<ClassRecord>[] = [
    { key: 'createdAt', header: 'Date', sortable: true, render: (row) => formatDate(row.createdAt) },
    { key: 'name', header: 'Class', sortable: true, render: (row) => <span className="font-medium text-foreground">{row.name}</span> },
    { key: 'studentCount', header: 'Students', sortable: true, render: (row) => row.studentCount.toLocaleString() },
    { key: 'assignmentCount', header: 'Assignments', sortable: true, render: (row) => row.assignmentCount.toLocaleString() },
    { key: 'status', header: 'Status', sortable: true, render: (row) => <ClassStatusChip status={row.status} /> },
  ];

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            Assignment Reader
          </p>
          <h1 className="mt-1 font-display text-[32px] font-medium leading-tight text-foreground">
            Classes
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Every class you teach, its roster, and its assignments.
          </p>
        </div>
      </header>

      <CanonicalList<ClassRecord>
        ariaLabel="Classes"
        columns={columns}
        rows={data?.data ?? []}
        getRowId={(row) => row.id}
        onRowActivate={(row) => void navigate({ to: '/classes/$classId', params: { classId: row.id }, search: defaultClassDashboardSearch })}
        rowAriaLabel={(row) => `Open class ${row.name}`}
        search={search.q}
        onSearchChange={(q) => onSearchChange({ q, page: 1 })}
        searchLabel="Search classes"
        searchPlaceholder="Search classes…"
        sort={search.sort}
        direction={search.direction}
        onSortChange={(sort, direction) =>
          onSearchChange({ sort: sort as ClassesSearch['sort'], direction, page: 1 })
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
            <p className="font-display text-xl font-medium text-foreground">No classes yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your first class to start building its roster and assignments.
            </p>
          </>
        }
        noMatchesFor={(value) => (
          <p className="text-sm text-muted-foreground">No classes match “{value}”.</p>
        )}
        filters={
          <StatusFilter
            value={search.status}
            onChange={(status) => onSearchChange({ status, page: 1 })}
          />
        }
        toolbarEnd={
          <Button type="button" onClick={() => setIsCreateOpen(true)} className="shrink-0">
            <Plus aria-hidden="true" className="h-4 w-4" />
            New class
          </Button>
        }
      />

      <ClassFormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        mode="create"
        isSubmitting={createClass.isPending}
        errorMessage={
          createClass.error instanceof SeatingApiError ? createClass.error.message : null
        }
        onSubmit={(name) => {
          createClass.mutate(
            { name },
            {
              onSuccess: (created) => {
                setIsCreateOpen(false);
                createClass.reset();
                void navigate({ to: '/classes/$classId', params: { classId: created.id }, search: defaultClassDashboardSearch });
              },
            },
          );
        }}
      />
    </section>
  );
}

function StatusFilter({
  value,
  onChange,
}: {
  value: ClassListQuery['status'];
  onChange: (status: ClassListQuery['status']) => void;
}) {
  const options: { value: ClassListQuery['status']; label: string }[] = [
    { value: undefined, label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'archived', label: 'Archived' },
  ];

  return (
    <div role="group" aria-label="Filter by status" className="flex rounded-full border border-border bg-card p-0.5">
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`min-h-9 rounded-full px-3 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            value === option.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
