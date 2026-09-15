import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { FormAlert, JobSummaryCard, formatDate } from '../components/job-panels';
import { fetchSeatingJobs, SeatingJobSummary } from '../lib/seating-api';

const pageDetails = {
  title: 'Seating Charts',
  description: 'View previously made seating chart arrangements.',
  dataText: {
    loading: 'Loading charts...',
    empty: 'No charts were able to be found.',
  },
};

export function JobsPage() {
  const [jobs, setJobs] = useState<SeatingJobSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchSeatingJobs(25);
        setJobs(data);
        setError(null);
      } catch (err) {
        console.error('Failed to load jobs', err);
        setError('Unable to load seating jobs.');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">{pageDetails.title}</h1>
        <p className="text-sm text-muted-foreground">{pageDetails.description}</p>
      </header>

      {error && <FormAlert tone="error">{error}</FormAlert>}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{pageDetails.dataText.loading}</p>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{pageDetails.dataText.empty}</p>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <article key={job.jobId} className="rounded-2xl border bg-card/70 p-4 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Link
                    to="/charts/$jobId"
                    params={{ jobId: job.jobId }}
                    className="text-lg font-semibold text-primary hover:underline"
                  >
                    {formatDate(job.createdAt)}
                  </Link>
                </div>
                <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                  {job.status}
                </span>
              </div>
              <div className="mt-4">
                <JobSummaryCard summary={job} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
