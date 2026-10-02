import type { ClassRecord, ListResponse, SavedSeatingChart } from '@classprints/assignment-reader-shared';
import { request } from './http';

export type { ClassRecord, SavedSeatingChart } from '@classprints/assignment-reader-shared';

/**
 * Lists the teacher's active classes for the "Save to class" selector
 * (TASK-009). Only the canonical-list parameters the `/classes` route
 * accepts are sent; results are name-sorted so the selector reads
 * alphabetically.
 */
export const fetchActiveClasses = async (q?: string): Promise<ListResponse<ClassRecord>> => {
  const params = new URLSearchParams({ status: 'active', sort: 'name', direction: 'asc' });
  if (q && q.trim().length > 0) {
    params.set('q', q.trim());
  }
  return request<ListResponse<ClassRecord>>(`/classes?${params.toString()}`);
};

/**
 * Copies the selected seating result into a class-scoped snapshot
 * (TASK-009). Idempotent per (classId, source job): saving again for the
 * same class/job returns the original snapshot instead of a new one.
 */
export const saveSeatingChartToClass = async (
  externalId: string,
  payload: { classId: string; resultId: number },
): Promise<SavedSeatingChart> => {
  const response = await request<{ data: SavedSeatingChart }>(
    `/seating/${externalId}/save-to-class`,
    { method: 'POST', body: payload },
  );
  return response.data;
};
