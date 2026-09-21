import { useState, type KeyboardEvent, type ReactNode } from 'react';
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
    info: 'border-primary/25 bg-secondary text-secondary-foreground',
    error: 'border-destructive/30 bg-destructive/10 text-destructive',
    warning: 'border-accent bg-accent/60 text-foreground',
  };

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-[12px] border px-4 py-3 text-sm ${toneClasses[tone]}`}
    >
      {children}
    </div>
  );
}

const statusDetails: Record<string, { label: string; className: string; animated?: boolean }> = {
  completed: {
    label: 'Ready',
    className: 'border-primary/20 bg-secondary text-secondary-foreground',
  },
  ready: {
    label: 'Ready',
    className: 'border-primary/20 bg-secondary text-secondary-foreground',
  },
  pending: {
    label: 'Generating',
    className: 'border-accent bg-accent text-foreground',
    animated: true,
  },
  generating: {
    label: 'Generating',
    className: 'border-accent bg-accent text-foreground',
    animated: true,
  },
  failed: {
    label: 'Failed',
    className: 'border-destructive/30 bg-destructive/10 text-destructive',
  },
  draft: {
    label: 'Draft',
    className: 'border-border bg-muted text-muted-foreground',
  },
};

export function JobStatusChip({ status }: { status: string }) {
  const normalizedStatus = status.toLowerCase();
  const details = statusDetails[normalizedStatus] ?? {
    label: normalizedStatus || 'Draft',
    className: 'border-border bg-muted text-muted-foreground',
  };

  return (
    <span
      aria-label={`Status: ${details.label}`}
      className={`inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.08em] ${details.className}`}
    >
      {details.animated ? (
        <span
          aria-hidden="true"
          className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-pulse"
        />
      ) : null}
      {details.label}
    </span>
  );
}

export function JobSummaryCard({ summary }: { summary: SeatingJobSummary }) {
  return (
    <dl className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3" aria-label="Chart summary">
      <SummaryItem
        label="Chart ID"
        value={
          <span className="block truncate font-mono text-xs" title={summary.jobId}>
            {shortJobId(summary.jobId)}
          </span>
        }
      />
      <SummaryItem label="Status" value={<JobStatusChip status={summary.status} />} />
      <SummaryItem label="Students" value={summary.studentCount.toLocaleString()} />
      <SummaryItem label="Seats enabled" value={summary.totalSeats.toLocaleString()} />
      <SummaryItem label="Conflicts" value={summary.conflictCount.toLocaleString()} />
      <SummaryItem label="Created" value={formatDate(summary.createdAt) ?? '—'} />
    </dl>
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
  const lastUpdate = formatDate(status?.updatedAt) ?? formatDate(summary.updatedAt) ?? '—';

  return (
    <section aria-labelledby="chart-progress-title" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 id="chart-progress-title" className="font-display text-xl font-medium">
              Generation progress
            </h2>
            <JobStatusChip status={activeStatus} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
            {activeStatus === 'pending'
              ? `Generating your chart · estimated completion ${completionEta}`
              : `Last updated ${lastUpdate}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRefreshing ? 'Refreshing status…' : 'Refresh status'}
        </button>
      </div>

      <ProgressTimeline status={activeStatus} resultsCount={status?.resultsCount ?? 0} />

      <dl className="grid gap-px overflow-hidden rounded-[12px] border border-border bg-border sm:grid-cols-3">
        <SummaryStat
          label="Results generated"
          value={status ? `${status.resultsCount} / ${status.maxResults}` : '—'}
        />
        <SummaryStat label="Started" value={formatDate(summary.createdAt) ?? '—'} />
        <SummaryStat label="Last activity" value={lastUpdate} />
      </dl>

      {error ? (
        <FormAlert tone="error">{error} Your existing chart details remain available.</FormAlert>
      ) : null}
      {status?.error ? <FormAlert tone="error">{status.error}</FormAlert> : null}
    </section>
  );
}

function ProgressTimeline({ status, resultsCount }: { status: string; resultsCount: number }) {
  const isComplete = status === 'completed' || status === 'ready';
  const isFailed = status === 'failed';
  const activeStep = resultsCount > 0 ? 2 : 1;
  const steps = ['Queued', 'Optimizing', 'Deduplicating', isFailed ? 'Failed' : 'Results ready'];

  return (
    <div className="overflow-x-auto pb-1">
      <ol className="flex min-w-[560px] items-center" aria-label="Chart generation stages">
        {steps.map((label, index) => {
          const state = isComplete
            ? 'done'
            : isFailed
              ? index < steps.length - 1
                ? 'done'
                : 'failed'
              : index < activeStep
                ? 'done'
                : index === activeStep
                  ? 'current'
                  : 'upcoming';
          return (
            <li key={label} className="contents">
              <div
                aria-current={state === 'current' ? 'step' : undefined}
                className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground"
              >
                <span
                  aria-hidden="true"
                  className={`grid h-6 w-6 place-items-center rounded-full border font-mono text-[11px] font-medium ${
                    state === 'done'
                      ? 'border-primary bg-primary text-primary-foreground'
                      : state === 'failed'
                        ? 'border-destructive bg-destructive/10 text-destructive'
                        : state === 'current'
                          ? 'border-primary bg-card text-primary'
                          : 'border-border bg-card text-muted-foreground'
                  }`}
                >
                  {state === 'done' ? '✓' : state === 'failed' ? '!' : index + 1}
                </span>
                <span
                  className={
                    state === 'current' || state === 'failed' ? 'font-semibold text-foreground' : ''
                  }
                >
                  {label}
                </span>
              </div>
              {index < steps.length - 1 ? (
                <span aria-hidden="true" className="mx-3 h-px min-w-6 flex-1 bg-border" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const ResultsPanelDetails = {
  loading: 'Loading result details…',
  empty:
    'No arrangements were produced. Try loosening one or more seating restrictions and generate another chart.',
  subtitle: 'Seating chart arrangements',
};

export function ResultsPanel({
  results,
  fallbackCols,
  seatGrid,
  jobId,
  summary,
  status,
}: {
  results: SeatingResultsResponse | null;
  fallbackCols?: number;
  seatGrid?: SeatingGrid | null;
  jobId?: string;
  summary?: SeatingJobSummary;
  status?: SeatingJobStatusResponse | null;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeStatus = status?.status ?? summary?.status ?? results?.status;

  if (!results) {
    if (activeStatus === 'failed') {
      return (
        <FormAlert tone="error">
          This chart could not be generated. {status?.error ?? 'Review the setup and try again.'}
        </FormAlert>
      );
    }

    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-[12px] border border-dashed border-border bg-muted/40 p-6"
      >
        <div
          className="h-3 w-28 rounded-full bg-border motion-safe:animate-pulse"
          aria-hidden="true"
        />
        <p className="mt-3 text-sm font-medium text-foreground">
          {activeStatus === 'pending'
            ? 'Your result options are being prepared.'
            : ResultsPanelDetails.loading}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          This area will update without hiding the chart information above.
        </p>
      </div>
    );
  }

  if (results.results.length === 0) {
    return (
      <FormAlert tone={results.error ? 'error' : 'warning'}>
        {results.error ?? ResultsPanelDetails.empty}
      </FormAlert>
    );
  }

  const activeIndex = Math.min(selectedIndex, results.results.length - 1);
  const activeResult = results.results[activeIndex];
  const resultId = `result-panel-${results.jobId}`;
  const score = formatScore(activeResult.fitnessScore);
  const seatedStudents = activeResult.arrangement.reduce(
    (count, row) => count + row.filter((name) => Boolean(name?.trim())).length,
    0,
  );
  const rows = activeResult.arrangement.length;
  const columns = activeResult.arrangement[0]?.length ?? fallbackCols ?? 0;

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (index + 1) % results.results.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + results.results.length) % results.results.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = results.results.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    setSelectedIndex(nextIndex);
    const tabs =
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs?.[nextIndex]?.focus();
  };

  return (
    <section aria-labelledby="results-title" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            Generated results
          </p>
          <h2 id="results-title" className="font-display text-2xl font-medium">
            {ResultsPanelDetails.subtitle}
          </h2>
        </div>
        {jobId ? (
          <DownloadCsvButton
            results={results.results}
            filename={`seating-${jobId}.csv`}
            label="Export all options"
          />
        ) : null}
      </div>

      <div role="tablist" aria-label="Result options" className="flex gap-2 overflow-x-auto pb-1">
        {results.results.map((result, index) => (
          <button
            key={result.createdAt + index}
            id={`result-tab-${results.jobId}-${index}`}
            type="button"
            role="tab"
            aria-selected={index === activeIndex}
            aria-controls={resultId}
            tabIndex={index === activeIndex ? 0 : -1}
            onClick={() => setSelectedIndex(index)}
            onKeyDown={(event) => handleOptionKeyDown(event, index)}
            className={`min-h-11 shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              index === activeIndex
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-card text-muted-foreground hover:border-primary hover:text-foreground'
            }`}
          >
            Option {optionLabel(index)} · {formatScore(result.fitnessScore)}
          </button>
        ))}
      </div>

      <div className={summary ? 'grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]' : ''}>
        <div
          id={resultId}
          role="tabpanel"
          aria-labelledby={`result-tab-${results.jobId}-${activeIndex}`}
          className="min-w-0 overflow-hidden rounded-[12px] border border-border bg-card shadow-card"
        >
          <div className="flex flex-wrap items-center gap-x-7 gap-y-3 border-b border-border px-4 py-4 sm:px-5">
            <ResultMetric
              label="Students seated"
              value={`${seatedStudents} / ${summary?.studentCount ?? seatedStudents}`}
            />
            <ResultMetric label="Layout" value={`${rows} × ${columns}`} />
            <ResultMetric label="Fitness score" value={score} />
            {jobId ? (
              <div className="sm:ml-auto">
                <DownloadCsvButton
                  results={[activeResult]}
                  filename={`seating-${jobId}-option-${optionLabel(activeIndex).toLowerCase()}.csv`}
                  label={`Export option ${optionLabel(activeIndex)}`}
                />
              </div>
            ) : null}
          </div>
          <div className="p-4 sm:p-5">
            <ArrangementGrid
              arrangement={activeResult.arrangement}
              fallbackCols={fallbackCols}
              seatGrid={seatGrid}
            />
            <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              Generated {formatDate(activeResult.createdAt) ?? '—'}
            </p>
          </div>
        </div>

        {summary ? (
          <aside className="mt-5 space-y-4 xl:mt-0" aria-label="Result and run summary">
            <div className="rounded-[12px] border border-border bg-card shadow-card">
              <div className="border-b border-border px-4 py-3.5">
                <h3 className="font-display text-lg font-medium">Option score</h3>
              </div>
              <div className="p-4">
                <div className="flex items-end justify-between gap-3">
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                    Overall fitness
                  </span>
                  <strong className="font-display text-3xl font-medium tabular-nums">
                    {score}
                  </strong>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <span className="block h-full rounded-full bg-primary" style={{ width: score }} />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  Higher scores indicate a stronger overall match for the submitted classroom
                  constraints.
                </p>
              </div>
            </div>

            <div className="rounded-[12px] border border-border bg-card shadow-card">
              <div className="border-b border-border px-4 py-3.5">
                <h3 className="font-display text-lg font-medium">Run summary</h3>
              </div>
              <dl className="divide-y divide-dashed divide-border px-4">
                <RailItem
                  label="Job ID"
                  value={shortJobId(summary.jobId)}
                  mono
                  title={summary.jobId}
                />
                <RailItem
                  label="Method"
                  value={formatAlgorithm(
                    status?.algorithm ?? results.algorithm ?? summary.algorithm,
                  )}
                />
                <RailItem
                  label="Candidates"
                  value={
                    status
                      ? `${status.resultsCount} / ${status.maxResults}`
                      : results.results.length.toString()
                  }
                />
                <RailItem label="Students" value={summary.studentCount.toLocaleString()} />
                <RailItem label="Enabled seats" value={summary.totalSeats.toLocaleString()} />
                <RailItem label="Conflicts" value={summary.conflictCount.toLocaleString()} />
              </dl>
            </div>
          </aside>
        ) : null}
      </div>
    </section>
  );
}

function SummaryItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="bg-card px-4 py-3.5">
      <dt className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
      <strong className="mt-0.5 block font-display text-xl font-medium tabular-nums">
        {value}
      </strong>
    </div>
  );
}

function RailItem({
  label,
  value,
  mono = false,
  title,
}: {
  label: string;
  value: string;
  mono?: boolean;
  title?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? 'font-mono text-xs' : 'font-semibold tabular-nums'} title={title}>
        {value}
      </dd>
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
    <div className="overflow-x-auto rounded-[12px] border border-border bg-muted/30 p-3 sm:p-4">
      <div
        role="grid"
        aria-label={`${arrangement.length} row by ${columns} column seating map`}
        className="grid w-max min-w-full gap-2"
        style={{ gridTemplateColumns: `24px repeat(${columns}, minmax(104px, 1fr))` }}
      >
        <div role="row" className="contents">
          <span aria-hidden="true" />
          {Array.from({ length: columns }, (_, columnIndex) => (
            <span
              key={`column-${columnIndex}`}
              role="columnheader"
              className="grid h-5 place-items-center font-mono text-[10px] text-muted-foreground"
            >
              {columnLabel(columnIndex)}
            </span>
          ))}
        </div>
        {arrangement.map((row, rowIndex) => {
          const rowCells = Array.from({ length: columns }, (_, colIndex) => {
            const displayName = row[colIndex]?.trim();
            const seatExists = seatGrid ? seatGrid[rowIndex]?.[colIndex] ?? false : true;
            const seatLabel = displayName ?? (seatExists ? 'Empty seat' : 'No seat');
            return (
              <div
                key={`${rowIndex}-${colIndex}`}
                role="gridcell"
                aria-label={`Row ${rowIndex + 1}, column ${columnLabel(colIndex)}: ${seatLabel}`}
                className={`grid min-h-16 min-w-[104px] place-items-center rounded-lg border px-2 py-2 text-center text-xs font-semibold leading-tight ${
                  displayName
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : seatExists
                      ? 'border-primary/30 bg-secondary text-secondary-foreground'
                      : 'border-dashed border-border bg-muted/50 text-muted-foreground'
                }`}
                title={seatLabel}
              >
                <span className="block max-w-28 break-words">{seatLabel}</span>
              </div>
            );
          });
          return (
            <div key={`row-${rowIndex}`} role="row" className="contents">
              <span
                role="rowheader"
                className="grid min-h-16 place-items-center font-mono text-[10px] text-muted-foreground"
              >
                {rowIndex + 1}
              </span>
              {rowCells}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const formatAlgorithm = (algorithm?: string) => {
  if (!algorithm) return '—';
  return algorithm === 'llm' ? 'AI assist' : 'Algorithmic';
};

const formatScore = (score: number) => {
  const percentage = score <= 1 ? score * 100 : score;
  return `${Math.max(0, Math.min(100, percentage)).toFixed(0)}%`;
};

const optionLabel = (index: number) =>
  index < 26 ? String.fromCharCode(65 + index) : String(index + 1);

const columnLabel = (index: number) => {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
};

const shortJobId = (jobId: string) =>
  jobId.length > 14 ? `${jobId.slice(0, 8)}…${jobId.slice(-4)}` : jobId;

export const formatDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};
