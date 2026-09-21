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
    <section aria-label="Generation results">
      {jobSummary ? (
        <div className="space-y-4 rounded-[12px] border border-line bg-card p-5 shadow-card">
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
        <div className="rounded-[12px] border border-dashed border-line bg-muted/40 p-5 text-sm text-muted-foreground">
          Submit a seating chart request to see live status updates here.
        </div>
      )}
    </section>
  );
}
