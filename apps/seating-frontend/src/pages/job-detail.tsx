import { FormAlert, JobStatusPanel, JobSummaryCard, ResultsPanel } from '../components/job-panels';
import { useSeatingJobSummary } from '../hooks/use-seating-job-summary';
import { useJobMonitor } from '../hooks/use-job-monitor';

const pageDetails = {
  back: '← Seating Charts',
  loading: 'Loading Details...',
  loadingFail: 'Failed to load details. Please try again.',
  notFound: 'Unable to find this seating chart arrangement. Please try again.',
};
export function JobDetailPage({ jobId }: { jobId: string }) {
  const { summary, isLoading, error } = useSeatingJobSummary(jobId);
  const {
    status,
    results,
    error: statusError,
    isRefreshing,
    isAutoRefreshing,
    refresh: refreshStatus,
  } = useJobMonitor(jobId);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{pageDetails.loading}</p>;
  }

  if (!summary) {
    return (
      <div className="space-y-4">
        {error && <FormAlert tone="error">{pageDetails.loadingFail}</FormAlert>}
        <p className="text-sm text-muted-foreground">{pageDetails.notFound}</p>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <button
        type="button"
        onClick={() => window.history.back()}
        className="text-sm font-medium text-primary hover:underline"
      >
        {pageDetails.back}
      </button>
      <div className="space-y-4 rounded-2xl border bg-card/60 p-6 shadow-card">
        <JobSummaryCard summary={summary} />
        {error && <FormAlert tone="error">{error.message}</FormAlert>}
        <JobStatusPanel
          summary={summary}
          status={status}
          error={statusError}
          isRefreshing={isRefreshing || isAutoRefreshing}
          onRefresh={refreshStatus}
        />
        <ResultsPanel results={results} jobId={jobId} />
      </div>
    </section>
  );
}
