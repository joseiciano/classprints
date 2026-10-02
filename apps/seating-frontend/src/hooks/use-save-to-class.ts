import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchActiveClasses, saveSeatingChartToClass } from '../lib/assignment-reader-api';

/**
 * Backs the "Save to class" selector (TASK-009): lists the teacher's active
 * classes, optionally filtered by `search`, for a combobox-style picker.
 */
export function useActiveClasses(search: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['assignment-reader', 'classes', 'active', search],
    queryFn: () => fetchActiveClasses(search),
    staleTime: 1000 * 30,
  });

  return {
    classes: data?.data ?? [],
    isLoading,
    error,
  };
}

/**
 * Saves the currently selected seating result into a class-scoped snapshot.
 * Invalidates that class's saved-chart list so a subsequent visit reflects
 * the new (or replayed) snapshot.
 */
export function useSaveSeatingChartToClass(jobExternalId: string) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (variables: { classId: string; resultId: number }) =>
      saveSeatingChartToClass(jobExternalId, variables),
    onSuccess: (_chart, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['assignment-reader', 'classes', variables.classId, 'seating-charts'],
      });
    },
  });

  const savedChart = mutation.data ?? null;
  // The backend is idempotent per (classId, source job): if a chart was
  // already saved to this class from a *different* result, saving again
  // returns that original snapshot unchanged rather than persisting the
  // newly selected one. Surface that mismatch so the UI doesn't claim the
  // just-selected arrangement was saved when it wasn't.
  const isReplayOfDifferentResult =
    savedChart !== null &&
    mutation.variables !== undefined &&
    savedChart.sourceResultId !== mutation.variables.resultId;

  return {
    saveToClass: mutation.mutateAsync,
    isSaving: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
    savedChart,
    isReplayOfDifferentResult,
  };
}
