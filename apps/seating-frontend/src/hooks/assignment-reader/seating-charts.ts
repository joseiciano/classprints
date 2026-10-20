import { useQuery } from '@tanstack/react-query';
import type { SeatingChartListQuery } from '@classprints/assignment-reader-shared';
import { fetchSavedSeatingChart, fetchSeatingCharts } from '../../lib/assignment-reader-api';
import { assignmentReaderKeys } from '../../lib/assignment-reader-query-keys';

export function useSeatingChartsList(classId: string, query: SeatingChartListQuery) {
  return useQuery({
    queryKey: assignmentReaderKeys.classes.seatingCharts.list(classId, query),
    queryFn: () => fetchSeatingCharts(classId, query),
    placeholderData: (previous) => previous,
  });
}

export function useSavedSeatingChart(chartId: string | undefined) {
  return useQuery({
    queryKey: assignmentReaderKeys.savedSeatingChart.detail(chartId ?? ''),
    queryFn: () => fetchSavedSeatingChart(chartId as string),
    enabled: Boolean(chartId),
  });
}
