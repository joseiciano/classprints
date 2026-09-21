import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { DownloadCsvButton } from '../components/download-csv-button';
import {
  FormAlert,
  JobStatusChip,
  JobStatusPanel,
  ResultsPanel,
  formatDate,
} from '../components/job-panels';
import { Button } from '../components/ui/button';
import { useSeatingJobSummary } from '../hooks/use-seating-job-summary';
import { useJobMonitor } from '../hooks/use-job-monitor';

const pageDetails = {
  loading: 'Loading chart details…',
  loadingFail: 'We could not load this seating chart.',
  notFound: 'The chart may no longer be available, or you may not have access to it.',
};

export function JobDetailPage({ jobId }: { jobId: string }) {
  const { summary, isLoading, error, refresh: refreshSummary } = useSeatingJobSummary(jobId);
  const {
    status,
    results,
    error: statusError,
    isRefreshing,
    isAutoRefreshing,
    refresh: refreshStatus,
  } = useJobMonitor(jobId);

  if (isLoading) {
    return <DetailLoadingState />;
  }

  if (!summary) {
    return (
      <section className="space-y-5">
        <Link
          to="/charts"
          className="inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to charts
        </Link>
        <div className="rounded-[12px] border border-border bg-card p-6 shadow-card">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-destructive">
            Chart unavailable
          </p>
          <h1 className="mt-2 font-display text-[32px] font-medium leading-tight">
            {pageDetails.loadingFail}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">{pageDetails.notFound}</p>
          {error ? (
            <div className="mt-5">
              <FormAlert tone="error">{error.message}</FormAlert>
            </div>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refreshSummary()}
            className="mt-5 min-h-11 rounded-full bg-card"
          >
            Try again
          </Button>
        </div>
      </section>
    );
  }

  const activeStatus = status?.status ?? summary.status;
  const shortId =
    summary.jobId.length > 14
      ? `${summary.jobId.slice(0, 8)}…${summary.jobId.slice(-4)}`
      : summary.jobId;
  const method =
    (status?.algorithm ?? results?.algorithm ?? summary.algorithm) === 'llm'
      ? 'AI assist'
      : 'Algorithmic';

  return (
    <section className="space-y-7">
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground"
      >
        <Link
          to="/charts"
          className="rounded-sm transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Charts
        </Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page" className="max-w-full truncate text-foreground">
          {shortId}
        </span>
      </nav>

      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[32px] font-medium leading-tight text-foreground">
              Seating chart
            </h1>
            <JobStatusChip status={activeStatus} />
          </div>
          <div className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2">
            <span>Created {formatDate(summary.createdAt) ?? '—'}</span>
            <span aria-hidden="true" className="hidden sm:inline">
              ·
            </span>
            <span>{summary.studentCount.toLocaleString()} students</span>
            <span aria-hidden="true" className="hidden sm:inline">
              ·
            </span>
            <span>{summary.totalSeats.toLocaleString()} enabled seats</span>
            <span aria-hidden="true" className="hidden sm:inline">
              ·
            </span>
            <span>{method}</span>
          </div>
        </div>
        {results?.results.length ? (
          <DownloadCsvButton
            results={results.results}
            filename={`seating-${jobId}.csv`}
            label="Export all options"
            className="w-full sm:w-auto"
          />
        ) : null}
      </header>

      {error ? (
        <FormAlert tone="error">
          We could not refresh the chart summary. The last available details are still shown.{' '}
          {error.message}
        </FormAlert>
      ) : null}

      <div className="rounded-[12px] border border-border bg-card p-4 shadow-card sm:p-5">
        <JobStatusPanel
          summary={summary}
          status={status}
          error={statusError}
          isRefreshing={isRefreshing || isAutoRefreshing}
          onRefresh={refreshStatus}
        />
      </div>

      <ResultsPanel results={results} jobId={jobId} summary={summary} status={status} />
    </section>
  );
}

function DetailLoadingState() {
  return (
    <section role="status" aria-label={pageDetails.loading} className="space-y-7">
      <span className="sr-only">{pageDetails.loading}</span>
      <div
        className="h-4 w-44 rounded-full bg-border motion-safe:animate-pulse"
        aria-hidden="true"
      />
      <div className="space-y-3" aria-hidden="true">
        <div className="h-10 w-72 max-w-full rounded-lg bg-border motion-safe:animate-pulse" />
        <div className="h-4 w-[420px] max-w-full rounded-full bg-border motion-safe:animate-pulse" />
      </div>
      <div
        className="h-52 rounded-[12px] border border-border bg-card motion-safe:animate-pulse"
        aria-hidden="true"
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]" aria-hidden="true">
        <div className="h-[420px] rounded-[12px] border border-border bg-card motion-safe:animate-pulse" />
        <div className="h-72 rounded-[12px] border border-border bg-card motion-safe:animate-pulse" />
      </div>
    </section>
  );
}
