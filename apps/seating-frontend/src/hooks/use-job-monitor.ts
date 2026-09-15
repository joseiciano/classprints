import { useCallback, useEffect, useState } from 'react';
import {
  SeatingApiError,
  SeatingJobStatusResponse,
  SeatingResultsResponse,
  fetchSeatingJobResults,
  fetchSeatingJobStatus,
} from '../lib/seating-api';

interface UseJobMonitorResult {
  status: SeatingJobStatusResponse | null;
  results: SeatingResultsResponse | null;
  error: string | null;
  isRefreshing: boolean;
  isAutoRefreshing: boolean;
  refresh: () => Promise<void>;
}

export function useJobMonitor(jobId?: string | null): UseJobMonitorResult {
  const [status, setStatus] = useState<SeatingJobStatusResponse | null>(null);
  const [results, setResults] = useState<SeatingResultsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);

  const fetchLatest = useCallback(async () => {
    if (!jobId) {
      return true;
    }

    try {
      const nextStatus = await fetchSeatingJobStatus(jobId);
      setStatus(nextStatus);
      setError(null);

      if (nextStatus.status === 'completed') {
        const nextResults = await fetchSeatingJobResults(jobId);
        setResults(nextResults);
        return true;
      }

      if (nextStatus.status === 'failed') {
        setResults(null);
        return true;
      }

      return false;
    } catch (err) {
      if (err instanceof SeatingApiError) {
        setError(err.message);
      } else {
        setError('Unable to refresh job status.');
      }
      return false;
    }
  }, [jobId]);

  const refresh = useCallback(async () => {
    if (!jobId) return;
    setIsRefreshing(true);
    try {
      await fetchLatest();
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchLatest, jobId]);

  useEffect(() => {
    setStatus(null);
    setResults(null);
    setError(null);
    if (!jobId) return;

    let cancelled = false;
    let timeoutId: number | undefined;

    const poll = async () => {
      if (cancelled) return;
      setIsAutoRefreshing(true);
      const finished = await fetchLatest();
      setIsAutoRefreshing(false);
      if (cancelled || finished) {
        return;
      }
      timeoutId = window.setTimeout(poll, 4000);
    };

    poll();

    return () => {
      cancelled = true;
      setIsAutoRefreshing(false);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [jobId, fetchLatest]);

  return {
    status,
    results,
    error,
    isRefreshing,
    isAutoRefreshing,
    refresh,
  };
}
