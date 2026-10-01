import { useEffect, useRef, useState } from 'react';
import { CanonicalListView, type CanonicalListColumn } from './canonical-list-view';

export type { CanonicalListColumn } from './canonical-list-view';

export interface CanonicalListProps<T> {
  ariaLabel: string;
  columns: CanonicalListColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onRowActivate?: (row: T) => void;
  rowAriaLabel?: (row: T) => string;
  rowClassName?: (row: T) => string;

  /** Current `q` value from the route's search params (the source of truth). */
  search: string;
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

  emptyState: React.ReactNode;
  noMatchesFor?: (search: string) => React.ReactNode;
  toolbarEnd?: React.ReactNode;
  filters?: React.ReactNode;
}

/**
 * The one sortable/searchable/paginated canonical-list implementation
 * (TASK-020, REQ-003). This smart wrapper owns only the search input's local
 * typed value, debouncing it before pushing `q` up to the caller (which
 * writes it to the route's URL search params); every other piece of list
 * state — sort, direction, page — stays fully controlled by the caller so
 * the URL remains the single source of truth (GUD-003).
 */
export function CanonicalList<T>({ search, onSearchChange, ...rest }: CanonicalListProps<T>) {
  const [searchValue, setSearchValue] = useState(search);
  const onSearchChangeRef = useRef(onSearchChange);
  useEffect(() => {
    onSearchChangeRef.current = onSearchChange;
  }, [onSearchChange]);

  // Keep the field in sync when the URL changes from elsewhere (back/forward,
  // a "clear search" action, or tab switches that reset the route search).
  useEffect(() => {
    setSearchValue(search);
  }, [search]);

  useEffect(() => {
    if (searchValue === search) return undefined;
    const timeoutId = window.setTimeout(() => {
      onSearchChangeRef.current(searchValue);
    }, 300);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  return (
    <CanonicalListView<T>
      {...rest}
      searchValue={searchValue}
      onSearchChange={setSearchValue}
    />
  );
}
