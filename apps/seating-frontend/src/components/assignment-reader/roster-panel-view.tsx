import { Pencil, Plus, UserMinus, UserX } from 'lucide-react';
import type { StudentListQuery, StudentRecord } from '@classprints/assignment-reader-shared';
import { formatDate } from '../../lib/assignment-reader-format';
import { Button } from '../ui/button';
import { CanonicalList, type CanonicalListColumn } from './canonical-list';

const STATUS_OPTIONS: { value: StudentListQuery['status']; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'removed', label: 'Removed' },
];

export interface RosterPanelViewProps {
  students: StudentRecord[];
  /**
   * True under an archived class: Add, Rename, and Remove are disabled.
   * Delete-data stays enabled regardless, per REQ-021/REQ-022.
   */
  readOnly?: boolean;
  isLoading?: boolean;
  isFetching?: boolean;
  error?: unknown;
  onRetry?: () => void;
  onAddStudent?: () => void;
  onRenameStudent?: (student: StudentRecord) => void;
  onRemoveStudent?: (student: StudentRecord) => void;
  onDeleteStudentData?: (student: StudentRecord) => void;

  /** Current `q` value from the route's search params (the source of truth). */
  search?: string;
  onSearchChange?: (value: string) => void;
  sort?: StudentListQuery['sort'];
  direction?: NonNullable<StudentListQuery['direction']>;
  onSortChange?: (sort: string, direction: 'asc' | 'desc') => void;
  page?: number;
  totalPages?: number;
  totalItems?: number;
  onPageChange?: (page: number) => void;
  statusFilter?: StudentListQuery['status'];
  onStatusFilterChange?: (status: StudentListQuery['status']) => void;
}

/**
 * Pure roster view (TASK-020's "roster management" smart/view pair), built
 * on the same canonical-list search/sort/pagination affordances as every
 * other roster-backed surface (REQ-003): the roster is a full
 * `StudentListQuery`, not just the first page of active students, so this
 * view exposes search, sortable columns, a status filter, and pagination
 * rather than silently truncating at the server's 10-per-page ceiling. An
 * archived class disables Add, Rename, and Remove, but not Delete-data:
 * REQ-021/REQ-022 exempt the destructive class, student-data, and
 * assignment deletion routes from the archived-read-only rule, so
 * Delete-data stays enabled here the same way Delete assignment and Delete
 * materials do elsewhere.
 */
export function RosterPanelView({
  students,
  readOnly = false,
  isLoading = false,
  isFetching = false,
  error,
  onRetry,
  onAddStudent,
  onRenameStudent,
  onRemoveStudent,
  onDeleteStudentData,
  search = '',
  onSearchChange = () => {},
  sort,
  direction = 'asc',
  onSortChange = () => {},
  page = 1,
  totalPages = students.length > 0 ? 1 : 0,
  totalItems = students.length,
  onPageChange = () => {},
  statusFilter,
  onStatusFilterChange = () => {},
}: RosterPanelViewProps) {
  const columns: CanonicalListColumn<StudentRecord>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (student) => <span className="font-medium text-foreground">{student.name}</span>,
    },
    {
      key: 'createdAt',
      header: 'Added',
      sortable: true,
      render: (student) => formatDate(student.createdAt),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (student) => (student.status === 'active' ? 'Active' : 'Removed'),
    },
    {
      key: 'actions',
      header: '',
      render: (student) => (
        <div className="inline-flex items-center gap-1">
          <IconButton
            label={`Rename ${student.name}`}
            icon={Pencil}
            disabled={readOnly || student.status !== 'active'}
            onClick={() => onRenameStudent?.(student)}
          />
          <IconButton
            label={`Remove ${student.name} from roster`}
            icon={UserMinus}
            disabled={readOnly || student.status !== 'active'}
            onClick={() => onRemoveStudent?.(student)}
          />
          <IconButton
            label={`Delete ${student.name}'s data`}
            icon={UserX}
            tone="destructive"
            onClick={() => onDeleteStudentData?.(student)}
          />
        </div>
      ),
      headerClassName: 'w-28',
      cellClassName: 'text-right',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-medium text-foreground">Roster</h2>
      </div>

      <CanonicalList<StudentRecord>
        ariaLabel="Roster"
        columns={columns}
        rows={students}
        getRowId={(student) => student.id}
        search={search}
        onSearchChange={(value) => onSearchChange(value)}
        searchLabel="Search roster"
        searchPlaceholder="Search by name…"
        sort={sort}
        direction={direction}
        onSortChange={onSortChange}
        page={page}
        totalPages={totalPages}
        totalItems={totalItems}
        onPageChange={onPageChange}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error}
        onRetry={onRetry}
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
          <Button type="button" size="sm" disabled={readOnly} onClick={onAddStudent}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            Add student
          </Button>
        }
        filters={
          <select
            aria-label="Filter by status"
            value={statusFilter ?? ''}
            onChange={(event) =>
              onStatusFilterChange((event.target.value || undefined) as StudentListQuery['status'])
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
