import { useDeferredValue, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Plus, Search } from 'lucide-react';
import { FormAlert, JobStatusChip, formatDate } from '../components/job-panels';
import { fetchSeatingJobs, type SeatingJobSummary } from '../lib/seating-api';

const pageDetails = {
  title: 'Charts',
  description: "Every seating arrangement you've generated, newest first.",
  loading: 'Loading seating charts…',
  empty: 'No seating charts yet.',
};
const JOBS_QUERY_KEY = ['seating-jobs', 25] as const;

export function JobsPage() {
  const {
    data: jobs = [],
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: JOBS_QUERY_KEY,
    queryFn: () => fetchSeatingJobs(25),
    staleTime: 30_000,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const stats = useMemo(() => {
    let generating = 0;
    let seatsPlaced = 0;
    for (const job of jobs) {
      if (job.status === 'pending') generating += 1;
      if (job.status === 'completed') seatsPlaced += job.studentCount;
    }
    return { generating, seatsPlaced };
  }, [jobs]);

  const visibleJobs = useMemo(() => {
    const query = deferredSearchQuery.trim().toLocaleLowerCase();
    if (!query) return jobs;

    return jobs.filter((job) => {
      const statusLabel =
        job.status === 'completed' ? 'ready' : job.status === 'pending' ? 'generating' : job.status;
      return [job.jobId, statusLabel, formatDate(job.createdAt), job.studentCount.toString()]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase().includes(query));
    });
  }, [deferredSearchQuery, jobs]);

  return (
    <section className="space-y-7">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            Classroom workspace
          </p>
          <h1 className="mt-1 font-display text-[32px] font-medium leading-tight text-foreground">
            {pageDetails.title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{pageDetails.description}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative block sm:w-64">
            <span className="sr-only">Search charts</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search charts…"
              className="min-h-11 w-full rounded-full border border-border bg-card py-2 pl-10 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            />
          </label>
          <Link
            to="/create-arrangement"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            New chart
          </Link>
        </div>
      </header>
      {isFetching && jobs.length > 0 ? (
        <p className="sr-only" role="status" aria-live="polite">
          Refreshing charts…
        </p>
      ) : null}

      {error ? (
        <FormAlert tone="error">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>Unable to refresh seating charts. The last available charts remain visible.</span>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="min-h-11 shrink-0 rounded-full border border-destructive/30 bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:border-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isFetching ? 'Trying again…' : 'Try again'}
            </button>
          </div>
        </FormAlert>
      ) : null}

      {isLoading ? (
        <ChartsLoadingState />
      ) : jobs.length === 0 ? (
        <div
          className="rounded-[12px] border border-dashed border-border bg-card px-6 py-12 text-center"
          role="status"
        >
          <p className="font-display text-2xl font-medium text-foreground">{pageDetails.empty}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Add a roster and classroom layout to generate your first optimized seating arrangement.
          </p>
          <Link
            to="/create-arrangement"
            className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            Create a chart
          </Link>
        </div>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Recent charts" value={jobs.length.toLocaleString()} />
            <StatCard label="Generating now" value={stats.generating.toLocaleString()} />
            <StatCard label="Students seated" value={stats.seatsPlaced.toLocaleString()} />
          </dl>

          {visibleJobs.length === 0 ? (
            <div
              className="rounded-[12px] border border-dashed border-border bg-card px-6 py-10 text-center"
              role="status"
            >
              <p className="font-display text-xl font-medium">
                No charts match “{deferredSearchQuery.trim()}”.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a date, chart ID, status, or student count.
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-4 min-h-11 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className="space-y-2.5" aria-label="Seating charts">
              {visibleJobs.map((job) => {
                const createdDate = new Date(job.createdAt);
                const dateLabel = Number.isNaN(createdDate.getTime())
                  ? job.createdAt
                  : createdDate.toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    });
                const shortId =
                  job.jobId.length > 14
                    ? `${job.jobId.slice(0, 8)}…${job.jobId.slice(-4)}`
                    : job.jobId;
                const statusLabel =
                  job.status === 'completed'
                    ? 'Ready'
                    : job.status === 'pending'
                      ? 'Generating'
                      : 'Failed';

                return (
                  <Link
                    key={job.jobId}
                    to="/charts/$jobId"
                    params={{ jobId: job.jobId }}
                    aria-label={`Open seating chart ${job.jobId}, created ${dateLabel}, ${job.studentCount} students, status ${statusLabel}`}
                    className="group grid min-h-24 grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-[12px] border border-border bg-card p-3.5 transition hover:-translate-y-px hover:border-primary hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:grid-cols-[96px_minmax(0,1fr)_auto_20px] sm:gap-x-5 sm:px-4"
                  >
                    <ChartThumbnail job={job} />
                    <div className="min-w-0 self-center">
                      <h2 className="truncate font-display text-lg font-medium text-foreground">
                        Seating chart · {dateLabel}
                      </h2>
                      <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2">
                        <span>{job.studentCount.toLocaleString()} students</span>
                        <span aria-hidden="true" className="hidden sm:inline">
                          ·
                        </span>
                        <span className="truncate font-mono text-[11px]">{shortId}</span>
                      </div>
                    </div>
                    <div className="col-start-2 row-start-2 justify-self-start sm:col-start-3 sm:row-start-1 sm:justify-self-end">
                      <JobStatusChip status={job.status} />
                    </div>
                    <ArrowRight
                      aria-hidden="true"
                      className="col-start-3 row-start-1 h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary sm:col-start-4"
                    />
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-border bg-card px-4 py-4 shadow-sm">
      <dt className="font-mono text-[10px] font-medium uppercase tracking-[0.09em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-display text-[26px] font-medium leading-none tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}

function ChartThumbnail({ job }: { job: SeatingJobSummary }) {
  const dotCount = 40;
  const enabledSeats = Math.max(job.totalSeats, 1);
  const filledDots = Math.round(Math.min(job.studentCount / enabledSeats, 1) * dotCount);

  return (
    <div
      aria-hidden="true"
      className="row-span-2 grid h-[54px] w-[72px] place-items-center rounded-lg border border-border bg-muted sm:row-span-1 sm:h-16 sm:w-24"
    >
      <span className="grid grid-cols-8 gap-[3px]">
        {Array.from({ length: dotCount }, (_, index) => (
          <span
            key={index}
            className={`h-1.5 w-1.5 rounded-[2px] ${index < filledDots ? 'bg-primary' : 'bg-border'}`}
          />
        ))}
      </span>
    </div>
  );
}

function ChartsLoadingState() {
  return (
    <div role="status" aria-label={pageDetails.loading} className="space-y-6">
      <span className="sr-only">{pageDetails.loading}</span>
      <div className="grid gap-3 sm:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="h-[82px] rounded-[12px] border border-border bg-card motion-safe:animate-pulse"
          />
        ))}
      </div>
      <div className="space-y-2.5" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-24 rounded-[12px] border border-border bg-card motion-safe:animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
