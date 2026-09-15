import type { ReactNode } from 'react';
import type { SeatingGrid } from '@classprints/seating-shared';
import type {
  SeatingJobStatusResponse,
  SeatingJobSummary,
  SeatingResultsResponse,
} from '../lib/seating-api';
import { DownloadCsvButton } from './download-csv-button';

export type AlertTone = 'info' | 'error' | 'warning';

export function FormAlert({ tone = 'info', children }: { tone?: AlertTone; children: ReactNode }) {
  const toneClasses: Record<AlertTone, string> = {
    info: 'border-info/40 bg-info/5 text-info-foreground',
    error: 'border-destructive/40 bg-destructive/10 text-destructive',
    warning: 'border-warning/40 bg-warning/10 text-warning-foreground',
  };
  return (
    <div className={`rounded-xl border px-4 py-2 text-sm font-medium ${toneClasses[tone]}`}>
      {children}
    </div>
  );
}

export function JobSummaryCard({ summary }: { summary: SeatingJobSummary }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SummaryItem
        label="Chart ID"
        value={<span className="font-mono text-xs">{summary.jobId}</span>}
      />
      <SummaryItem
        label="Status"
        value={<span className="font-semibold capitalize">{summary.status}</span>}
      />
      <SummaryItem label="Students" value={summary.studentCount} />
      <SummaryItem label="Seats enabled" value={summary.totalSeats} />
      <SummaryItem label="Conflicts" value={summary.conflictCount} />
      <SummaryItem label="Created" value={formatDate(summary.createdAt) ?? '—'} />
    </div>
  );
}

export function JobStatusPanel({
  summary,
  status,
  error,
  isRefreshing,
  onRefresh,
}: {
  summary: SeatingJobSummary;
  status: SeatingJobStatusResponse | null;
  error: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  const activeStatus = status?.status ?? summary.status;
  const completionEta = summary.estimatedResultsAt
    ? formatDate(summary.estimatedResultsAt)
    : 'Calculating…';

  if (activeStatus === 'completed' || activeStatus === 'failed') {
    return null;
  }

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-background/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            {activeStatus === 'pending'
              ? `ETA ${completionEta}`
              : `Last update ${formatDate(status?.updatedAt) ?? formatDate(summary.updatedAt) ?? '—'}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <SummaryStat
          label="Status"
          value={<span className="text-base font-semibold capitalize">{activeStatus}</span>}
        />
        <SummaryStat
          label="Results generated"
          value={status ? `${status.resultsCount} / ${status.maxResults}` : '—'}
        />
        <SummaryStat label="Started" value={formatDate(summary.createdAt) ?? '—'} />
      </dl>

      {error && <FormAlert tone="error">{error}</FormAlert>}
      {status?.error && <FormAlert tone="error">{status.error}</FormAlert>}
    </div>
  );
}

const ResultsPanelDetails = {
  loading: 'Loading details...',
  empty: 'Unable to produce arrangements with this configuration. Consider loosening restrictions.',
  subtitle: 'Seating Chart Arrangements',
};
export function ResultsPanel({
  results,
  fallbackCols,
  seatGrid,
  jobId,
}: {
  results: SeatingResultsResponse | null;
  fallbackCols?: number;
  seatGrid?: SeatingGrid | null;
  jobId?: string;
}) {
  if (!results) {
    return (
      <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/10 p-4 text-sm text-muted-foreground">
        {ResultsPanelDetails.loading}
      </div>
    );
  }

  if (results.results.length === 0) {
    return <FormAlert tone="warning">{ResultsPanelDetails.empty}</FormAlert>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{ResultsPanelDetails.subtitle}</h3>
        {jobId && <DownloadCsvButton results={results.results} filename={`seating-${jobId}.csv`} />}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {results.results.map((result, index) => (
          <div
            key={result.createdAt + index}
            className="space-y-3 rounded-xl border border-border/60 bg-background/80 p-4"
          >
            <div className="flex items-center justify-between text-sm">
              <p className="font-semibold">Option {index + 1}</p>
              {/* <p className="text-muted-foreground">Fitness {result.fitnessScore.toFixed(2)}</p> */}
            </div>
            <ArrangementGrid
              arrangement={result.arrangement}
              fallbackCols={fallbackCols}
              seatGrid={seatGrid}
            />
            <p className="text-xs text-muted-foreground">Created {formatDate(result.createdAt)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold">{value}</dd>
    </div>
  );
}

function ArrangementGrid({
  arrangement,
  fallbackCols,
  seatGrid,
}: {
  arrangement: (string | null)[][];
  fallbackCols?: number;
  seatGrid?: SeatingGrid | null;
}) {
  const columns = arrangement[0]?.length ?? fallbackCols ?? 1;
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {arrangement.map((row, rowIndex) =>
        row.map((name, colIndex) => {
          const displayName = name?.trim();
          const isOccupied = Boolean(displayName);
          const isSeat = seatGrid?.[rowIndex]?.[colIndex] ?? false;
          return (
            <div
              key={`${rowIndex}-${colIndex}`}
              className={`flex min-h-[56px] items-center justify-center rounded-lg border px-2 text-center text-xs font-semibold leading-tight ${
                isOccupied
                  ? 'border-primary/40 bg-primary/10 text-foreground shadow-card'
                  : isSeat
                    ? 'border-primary/30 bg-primary/5 text-foreground/80'
                    : 'border-dashed border-border/50 bg-muted/30 text-muted-foreground'
              }`}
              title={displayName ?? 'Seat unavailable'}
            >
              <span className="block w-full break-words">{displayName ?? '—'}</span>
            </div>
          );
        }),
      )}
    </div>
  );
}

export const formatDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};
