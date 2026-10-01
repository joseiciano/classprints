import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Archive, Pencil, Trash2 } from 'lucide-react';
import {
  defaultAssignmentsSearch,
  AssignmentsTab,
  type AssignmentsTabSearch,
} from '../../components/assignment-reader/assignments-tab';
import { ConfirmActionDialog } from '../../components/assignment-reader/confirm-action-dialog';
import { ClassFormDialog } from '../../components/assignment-reader/class-form-dialog';
import { RosterPanel } from '../../components/assignment-reader/roster-panel';
import {
  defaultSeatingChartsSearch,
  SeatingChartsTab,
  type SeatingChartsTabSearch,
} from '../../components/assignment-reader/seating-charts-tab';
import { ClassStatusChip } from '../../components/assignment-reader/status-chips';
import { useClass, useDeleteClass, useUpdateClass } from '../../hooks/use-assignment-reader';
import { SeatingApiError } from '../../lib/http';
import { LoadingScreen } from '../../components/ui/loading-screen';
import type { ClassesSearch } from './classes';

// A literal default (not imported from `./classes`) so this module and
// `./classes` — which needs this page's own default tab search to link back
// in — never form an import cycle.
const classesListDefaultSearch: ClassesSearch = {
  q: '',
  sort: 'createdAt',
  direction: 'desc',
  page: 1,
};

export type ClassDashboardTab = 'assignments' | 'roster' | 'seating-charts';

export interface ClassDashboardSearch {
  tab: ClassDashboardTab;
  q: string;
  sort: string;
  direction: 'asc' | 'desc';
  page: number;
  status?: string;
}

export const defaultClassDashboardSearch: ClassDashboardSearch = {
  tab: 'assignments',
  ...defaultAssignmentsSearch,
};

const TABS: { id: ClassDashboardTab; label: string }[] = [
  { id: 'assignments', label: 'Assignments' },
  { id: 'roster', label: 'Roster' },
  { id: 'seating-charts', label: 'Seating Charts' },
];

// The Roster panel has no search/sort/pagination of its own (it isn't one
// of REQ-003's canonical-list surfaces), so switching to it just reuses the
// Assignments defaults as inert filler for the shared search shape.
export const classDashboardTabDefaults: Record<ClassDashboardTab, Omit<ClassDashboardSearch, 'tab'>> = {
  assignments: defaultAssignmentsSearch,
  roster: defaultAssignmentsSearch,
  'seating-charts': defaultSeatingChartsSearch,
};

export function ClassDashboardPage({
  classId,
  search,
  onSearchChange,
}: {
  classId: string;
  search: ClassDashboardSearch;
  onSearchChange: (next: ClassDashboardSearch) => void;
}) {
  const navigate = useNavigate();
  const { data: classRecord, isLoading, error, refetch } = useClass(classId);
  const updateClass = useUpdateClass(classId);
  const deleteClass = useDeleteClass(classId);

  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  if (isLoading) {
    return <LoadingScreen fullScreen={false} />;
  }

  if (!classRecord) {
    return (
      <section className="space-y-5">
        <BackLink />
        <div className="rounded-[12px] border border-border bg-card p-6 shadow-card">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-destructive">
            Class unavailable
          </p>
          <h1 className="mt-2 font-display text-[28px] font-medium leading-tight">
            We could not load this class.
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            It may have been deleted, or you may not have access to it.
          </p>
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

  const isArchived = classRecord.status === 'archived';

  const setTab = (tab: ClassDashboardTab) => {
    onSearchChange({ tab, ...classDashboardTabDefaults[tab] });
  };

  return (
    <section className="space-y-6">
      <BackLink />

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="truncate font-display text-[32px] font-medium leading-tight text-foreground">
              {classRecord.name}
            </h1>
            <ClassStatusChip status={classRecord.status} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {classRecord.studentCount.toLocaleString()} students ·{' '}
            {classRecord.assignmentCount.toLocaleString()} assignments
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <HeaderButton
            label="Rename class"
            icon={Pencil}
            disabled={isArchived}
            onClick={() => setIsRenameOpen(true)}
          />
          <HeaderButton
            label="Archive class"
            icon={Archive}
            disabled={isArchived}
            onClick={() => setIsArchiveOpen(true)}
          />
          <HeaderButton
            label="Delete class"
            icon={Trash2}
            tone="destructive"
            onClick={() => setIsDeleteOpen(true)}
          />
        </div>
      </header>

      {isArchived ? (
        <p role="status" className="rounded-[10px] border border-border bg-muted px-4 py-2.5 text-sm text-muted-foreground">
          This class is archived. It is read-only except for destructive deletion.
        </p>
      ) : null}

      <div role="tablist" aria-label="Class sections" className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={search.tab === tab.id}
            onClick={() => setTab(tab.id)}
            className={`min-h-11 rounded-t-lg px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              search.tab === tab.id
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {search.tab === 'assignments' ? (
          <AssignmentsTab
            classId={classId}
            isArchived={isArchived}
            search={search as unknown as AssignmentsTabSearch}
            onSearchChange={(next) => onSearchChange({ ...search, ...next })}
          />
        ) : search.tab === 'roster' ? (
          <RosterPanel classId={classId} isArchived={isArchived} />
        ) : (
          <SeatingChartsTab
            classId={classId}
            search={search as unknown as SeatingChartsTabSearch}
            onSearchChange={(next) => onSearchChange({ ...search, ...next })}
          />
        )}
      </div>

      <ClassFormDialog
        open={isRenameOpen}
        onOpenChange={setIsRenameOpen}
        mode="rename"
        initialName={classRecord.name}
        isSubmitting={updateClass.isPending}
        errorMessage={updateClass.error instanceof SeatingApiError ? updateClass.error.message : null}
        onSubmit={(name) =>
          updateClass.mutate(
            { name },
            { onSuccess: () => { setIsRenameOpen(false); updateClass.reset(); } },
          )
        }
      />

      <ConfirmActionDialog
        open={isArchiveOpen}
        onOpenChange={setIsArchiveOpen}
        title="Archive this class?"
        description="Archived classes become read-only. You can still delete class, student, or assignment data afterward."
        confirmLabel="Archive class"
        isSubmitting={updateClass.isPending}
        errorMessage={updateClass.error instanceof SeatingApiError ? updateClass.error.message : null}
        onConfirm={() =>
          updateClass.mutate(
            { status: 'archived' },
            { onSuccess: () => { setIsArchiveOpen(false); updateClass.reset(); } },
          )
        }
      />

      <ConfirmActionDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Delete this class?"
        description="This permanently deletes the class, its roster, every assignment, and every submission and page they contain. This cannot be undone."
        confirmLabel="Delete class"
        tone="destructive"
        isSubmitting={deleteClass.isPending}
        errorMessage={deleteClass.error instanceof SeatingApiError ? deleteClass.error.message : null}
        onConfirm={() =>
          deleteClass.mutate(undefined, {
            onSuccess: () => void navigate({ to: '/classes', search: classesListDefaultSearch }),
          })
        }
      />
    </section>
  );
}

function BackLink() {
  return (
    <Link
      to="/classes"
      search={classesListDefaultSearch}
      className="inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      Back to classes
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
