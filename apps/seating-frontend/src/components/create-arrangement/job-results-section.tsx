import type {
  SeatingJobStatusResponse,
  SeatingJobSummary,
  SeatingResultsResponse,
} from '../../lib/seating-api';
import type { SeatingGrid } from '@classprints/seating-shared';
import { JobStatusPanel, JobSummaryCard, ResultsPanel } from '../job-panels';

type JobResultsSectionProps = {
  jobSummary: SeatingJobSummary | null;
  jobStatus: SeatingJobStatusResponse | null;
  jobResults: SeatingResultsResponse | null;
  statusError: string | null;
  isRefreshing: boolean;
  isAutoRefreshing: boolean;
  onRefresh: () => void;
  fallbackCols: number;
  seatGrid: SeatingGrid | null;
};

export function JobResultsSection({
  jobSummary,
  jobStatus,
  jobResults,
  statusError,
  isRefreshing,
  isAutoRefreshing,
  onRefresh,
  fallbackCols,
  seatGrid,
}: JobResultsSectionProps) {
  return (
    <section className="space-y-4">
      {jobSummary ? (
        <div className="space-y-4 rounded-2xl border bg-card/60 p-6 shadow-card">
          <JobSummaryCard summary={jobSummary} />
          <JobStatusPanel
            summary={jobSummary}
            status={jobStatus}
            error={statusError}
            isRefreshing={isRefreshing || isAutoRefreshing}
            onRefresh={onRefresh}
          />
          <ResultsPanel results={jobResults} fallbackCols={fallbackCols} seatGrid={seatGrid} />
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-muted-foreground/40 bg-muted/20 p-6 text-sm text-muted-foreground">
          Submit a seating chart request to see live status updates here.
        </div>
      )}
    </section>
  );
}
