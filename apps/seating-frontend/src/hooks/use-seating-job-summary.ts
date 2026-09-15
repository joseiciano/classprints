import { useQuery } from '@tanstack/react-query';
import { SeatingJobSummary, fetchSeatingJobSummary } from '../lib/seating-api';

interface UseSeatingJobSummaryResult {
  summary: SeatingJobSummary | undefined;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useSeatingJobSummary(jobId?: string | null): UseSeatingJobSummaryResult {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['seating-job', jobId, 'summary'],
    queryFn: () => fetchSeatingJobSummary(jobId as string),
    enabled: !!jobId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2,
  });

  const refresh = async () => {
    await refetch();
  };

  return {
    summary: data,
    isLoading,
    error,
    refresh,
  };
}
