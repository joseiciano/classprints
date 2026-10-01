import { Pencil, Plus, UserMinus, UserX } from 'lucide-react';
import type { StudentRecord } from '@classprints/assignment-reader-shared';
import { formatDate } from '../../lib/assignment-reader-format';
import { Button } from '../ui/button';

export interface RosterPanelViewProps {
  students: StudentRecord[];
  /** True under an archived class: every mutation control is disabled. */
  readOnly?: boolean;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  onAddStudent?: () => void;
  onRenameStudent?: (student: StudentRecord) => void;
  onRemoveStudent?: (student: StudentRecord) => void;
  onDeleteStudentData?: (student: StudentRecord) => void;
}

/**
 * Pure roster view (TASK-020's "roster management" smart/view pair). An
 * archived class is read-only end to end: Add, Rename, Remove, and
 * Delete-data are all disabled, since the sanctioned destructive action for
 * an archived class is deleting the whole class, not its individual
 * students.
 */
export function RosterPanelView({
  students,
  readOnly = false,
  isLoading = false,
  error,
  onRetry,
  onAddStudent,
  onRenameStudent,
  onRemoveStudent,
  onDeleteStudentData,
}: RosterPanelViewProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-medium text-foreground">Roster</h2>
        <Button type="button" size="sm" disabled={readOnly} onClick={onAddStudent}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          Add student
        </Button>
      </div>

      {error ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-[12px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
        >
          <span>Unable to load the roster.</span>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="min-h-9 shrink-0 rounded-full border border-destructive/30 bg-card px-3.5 py-1.5 text-[13px] font-semibold text-foreground transition hover:border-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-2" aria-hidden="true">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-12 rounded-[10px] border border-border bg-card motion-safe:animate-pulse" />
          ))}
        </div>
      ) : students.length === 0 ? (
        <div role="status" className="rounded-[12px] border border-dashed border-border bg-card px-6 py-10 text-center">
          <p className="font-display text-xl font-medium text-foreground">No students yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">Add your first roster student.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[12px] border border-border bg-card">
          <table className="w-full min-w-[420px] border-collapse text-left text-sm">
            <caption className="sr-only">Roster</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Name
                </th>
                <th scope="col" className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Added
                </th>
                <th scope="col" className="px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-right font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 font-medium text-foreground">{student.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(student.createdAt)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {student.status === 'active' ? 'Active' : 'Removed'}
                  </td>
                  <td className="px-4 py-3 text-right">
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
                        disabled={readOnly}
                        onClick={() => onDeleteStudentData?.(student)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
