import { useState } from 'react';
import type { SavedSeatingChart, SeatingChartListQuery } from '@classprints/assignment-reader-shared';
import { useSeatingChartsList } from '../../hooks/use-assignment-reader';
import { formatDate } from '../../lib/assignment-reader-format';
import { CanonicalList, type CanonicalListColumn } from './canonical-list';
import { SavedChartPanelView } from './saved-chart-panel-view';

export interface SeatingChartsTabSearch {
  q: string;
  sort: NonNullable<SeatingChartListQuery['sort']>;
  direction: NonNullable<SeatingChartListQuery['direction']>;
  page: number;
}

export const defaultSeatingChartsSearch: SeatingChartsTabSearch = {
  q: '',
  sort: 'createdAt',
  direction: 'desc',
  page: 1,
};

export function SeatingChartsTab({
  classId,
  search,
  onSearchChange,
}: {
  classId: string;
  search: SeatingChartsTabSearch;
  onSearchChange: (next: Partial<SeatingChartsTabSearch>) => void;
}) {
  const [openChart, setOpenChart] = useState<SavedSeatingChart | null>(null);

  const query: SeatingChartListQuery = {
    q: search.q || undefined,
    sort: search.sort,
    direction: search.direction,
    page: search.page,
  };
  const { data, isLoading, isFetching, error, refetch } = useSeatingChartsList(classId, query);

  const columns: CanonicalListColumn<SavedSeatingChart>[] = [
    { key: 'createdAt', header: 'Date', sortable: true, render: (row) => formatDate(row.createdAt) },
    { key: 'className', header: 'Class', sortable: true, render: (row) => row.className },
    { key: 'studentCount', header: 'Student Count', sortable: true, render: (row) => row.studentCount.toLocaleString() },
  ];

  return (
    <div className="space-y-4">
      <CanonicalList<SavedSeatingChart>
        ariaLabel="Saved seating charts"
        columns={columns}
        rows={data?.data ?? []}
        getRowId={(row) => row.id}
        onRowActivate={(row) => setOpenChart(row)}
        rowAriaLabel={(row) => `Open seating chart saved ${formatDate(row.createdAt)}`}
        search={search.q}
        onSearchChange={(q) => onSearchChange({ q, page: 1 })}
        searchLabel="Search saved charts"
        searchPlaceholder="Search saved charts…"
        sort={search.sort}
        direction={search.direction}
        onSortChange={(sort, direction) =>
          onSearchChange({ sort: sort as SeatingChartsTabSearch['sort'], direction, page: 1 })
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
            <p className="font-display text-xl font-medium text-foreground">No saved charts yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Save a generated seating chart to this class from the Charts tab to see it here.
            </p>
          </>
        }
        noMatchesFor={(value) => (
          <p className="text-sm text-muted-foreground">No saved charts match “{value}”.</p>
        )}
      />

      <SavedChartPanelView
        open={openChart !== null}
        onOpenChange={(open) => !open && setOpenChart(null)}
        chart={openChart}
        loading={false}
        error={null}
      />
    </div>
  );
}
