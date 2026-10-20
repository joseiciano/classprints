import type { KeyboardEvent, ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';

export interface CanonicalListColumn<T> {
  /** The server-side `sort` value this column represents, if any. */
  key: string;
  header: string;
  sortable?: boolean;
  render: (row: T) => ReactNode;
  headerClassName?: string;
  cellClassName?: string;
}

export interface CanonicalListViewProps<T> {
  ariaLabel: string;
  columns: CanonicalListColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onRowActivate?: (row: T) => void;
  rowAriaLabel?: (row: T) => string;
  rowClassName?: (row: T) => string;

  searchValue: string;
  onSearchChange: (value: string) => void;
  searchLabel: string;
  searchPlaceholder?: string;

  sort?: string;
  direction: 'asc' | 'desc';
  onSortChange: (sort: string, direction: 'asc' | 'desc') => void;

  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;

  isLoading: boolean;
  isFetching?: boolean;
  error?: unknown;
  onRetry?: () => void;

  emptyState: ReactNode;
  noMatchesFor?: (search: string) => ReactNode;
  toolbarEnd?: ReactNode;
  filters?: ReactNode;
}

export function CanonicalListView<T>({
  ariaLabel,
  columns,
  rows,
  getRowId,
  onRowActivate,
  rowAriaLabel,
  rowClassName,
  searchValue,
  onSearchChange,
  searchLabel,
  searchPlaceholder,
  sort,
  direction,
  onSortChange,
  page,
  totalPages,
  totalItems,
  onPageChange,
  isLoading,
  isFetching,
  error,
  onRetry,
  emptyState,
  noMatchesFor,
  toolbarEnd,
  filters,
}: CanonicalListViewProps<T>) {
  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (!onRowActivate) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onRowActivate(row);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block sm:w-72">
          <span className="sr-only">{searchLabel}</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder ?? searchLabel}
            className="min-h-11 w-full rounded-full border border-border bg-card py-2 pl-10 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {filters}
          {toolbarEnd}
        </div>
      </div>

      {isFetching && !isLoading ? (
        <p className="sr-only" role="status" aria-live="polite">
          Refreshing {ariaLabel}…
        </p>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-[12px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
        >
          <span>Unable to load {ariaLabel.toLowerCase()}.</span>
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
        <ListLoadingSkeleton />
      ) : rows.length === 0 ? (
        <div
          role="status"
          className="rounded-[12px] border border-dashed border-border bg-card px-6 py-10 text-center"
        >
          {searchValue.trim() && noMatchesFor
            ? noMatchesFor(searchValue.trim())
            : emptyState}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[12px] border border-border bg-card">
          <table className="w-full min-w-[480px] border-collapse text-left text-sm">
            <caption className="sr-only">{ariaLabel}</caption>
            <thead>
              <tr className="border-b border-border">
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={
                      sort === column.key ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'
                    }
                    className={`px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground ${column.headerClassName ?? ''}`}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        onClick={() =>
                          onSortChange(
                            column.key,
                            sort === column.key && direction === 'asc' ? 'desc' : 'asc',
                          )
                        }
                        className="inline-flex min-h-9 items-center gap-1 rounded-md px-1 -mx-1 text-left transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {column.header}
                        {sort === column.key ? (
                          direction === 'asc' ? (
                            <ArrowUp aria-hidden="true" className="h-3 w-3" />
                          ) : (
                            <ArrowDown aria-hidden="true" className="h-3 w-3" />
                          )
                        ) : (
                          <ArrowUpDown aria-hidden="true" className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const id = getRowId(row);
                return (
                  <tr
                    key={id}
                    tabIndex={onRowActivate ? 0 : undefined}
                    role={onRowActivate ? 'button' : undefined}
                    aria-label={rowAriaLabel?.(row)}
                    onClick={onRowActivate ? () => onRowActivate(row) : undefined}
                    onKeyDown={onRowActivate ? (event) => handleRowKeyDown(event, row) : undefined}
                    className={`border-b border-border last:border-b-0 ${
                      onRowActivate
                        ? 'cursor-pointer transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary'
                        : ''
                    } ${rowClassName?.(row) ?? ''}`}
                  >
                    {columns.map((column) => (
                      <td key={column.key} className={`px-4 py-3 align-middle ${column.cellClassName ?? ''}`}>
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && rows.length > 0 ? (
        <nav
          aria-label={`${ariaLabel} pagination`}
          className="flex items-center justify-between gap-3 text-sm text-muted-foreground"
        >
          <span>
            Page {page} of {Math.max(totalPages, 1)} · {totalItems.toLocaleString()} total
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="min-h-9 rounded-full border border-border bg-card px-3.5 py-1.5 text-[13px] font-semibold text-foreground transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="min-h-9 rounded-full border border-border bg-card px-3.5 py-1.5 text-[13px] font-semibold text-foreground transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function ListLoadingSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className="h-12 rounded-[10px] border border-border bg-card motion-safe:animate-pulse"
        />
      ))}
    </div>
  );
}
