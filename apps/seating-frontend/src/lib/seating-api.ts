import type {
  CreateSeatingJobPayload,
  SeatingJobStatusResponse,
  SeatingJobSummary,
  SeatingResultsResponse,
  SeatingConfig,
  CreateSeatingConfigPayload,
  UpdateSeatingConfigPayload,
} from '@classprints/seating-shared';
import { request } from './http';

export type {
  CreateSeatingJobPayload,
  SeatingJobStatusResponse,
  SeatingJobSummary,
  SeatingResultsResponse,
  SeatingConfig,
  CreateSeatingConfigPayload,
  UpdateSeatingConfigPayload,
} from '@classprints/seating-shared';

export { SeatingApiError } from './http';

export const createSeatingJob = async (payload: CreateSeatingJobPayload) => {
  const body = {
    students: payload.students,
    seatingGrid: payload.seatingGrid,
    conflicts: payload.conflicts ?? {},
    worksWellWithSoft: payload.worksWellWithSoft ?? {},
    worksWellWithStrong: payload.worksWellWithStrong ?? {},
    seatContenders: payload.seatContenders ?? {},
    algorithm: payload.algorithm,
    results: payload.results ?? 1,
  };

  const response = await request<{ message: string; data: SeatingJobSummary }>('/seating', {
    method: 'POST',
    body,
  });

  return response.data;
};

export const createSeatingAiJob = async (payload: CreateSeatingJobPayload) => {
  const body = {
    students: payload.students,
    seatingGrid: payload.seatingGrid,
    conflicts: payload.conflicts ?? {},
    worksWellWithSoft: payload.worksWellWithSoft ?? {},
    worksWellWithStrong: payload.worksWellWithStrong ?? {},
    seatContenders: payload.seatContenders ?? {},
    results: payload.results ?? 1,
  };

  const response = await request<{ message: string; data: SeatingJobSummary }>('/seating/llm', {
    method: 'POST',
    body,
  });

  return response.data;
};

export const fetchSeatingJobStatus = (jobId: string) =>
  request<SeatingJobStatusResponse>(`/seating/${jobId}`);

export const fetchSeatingJobResults = (jobId: string) =>
  request<SeatingResultsResponse>(`/seating/${jobId}/results`);

export const fetchSeatingJobs = async (limit = 20) => {
  const response = await request<{ data: SeatingJobSummary[] }>(`/seating?limit=${limit}`);
  return response.data;
};

export const fetchSeatingJobSummary = async (jobId: string) => {
  const response = await request<{ data: SeatingJobSummary }>(`/seating/${jobId}/summary`);
  return response.data;
};

// Config API functions

export const fetchSeatingConfigs = async (limit = 100) => {
  const response = await request<{ data: SeatingConfig[] }>(`/seating/configs?limit=${limit}`);
  return response.data;
};

export const fetchSeatingConfig = (configId: string) =>
  request<{ data: SeatingConfig }>(`/seating/configs/${configId}`);

export const createSeatingConfig = async (payload: CreateSeatingConfigPayload) => {
  const body = {
    name: payload.name,
    students: payload.students,
    conflicts: payload.conflicts ?? {},
    worksWellWithSoft: payload.worksWellWithSoft ?? {},
    worksWellWithStrong: payload.worksWellWithStrong ?? {},
    seatContenders: payload.seatContenders ?? {},
    seatingGrid: payload.seatingGrid,
  };

  const response = await request<{ data: SeatingConfig }>('/seating/configs', {
    method: 'POST',
    body,
  });

  return response.data;
};

export const updateSeatingConfig = async (
  configId: string,
  payload: UpdateSeatingConfigPayload,
) => {
  const response = await request<{ data: SeatingConfig }>(`/seating/configs/${configId}`, {
    method: 'PATCH',
    body: payload,
  });

  return response.data;
};

export const deleteSeatingConfig = async (configId: string) => {
  const response = await request<{ message: string }>(`/seating/configs/${configId}`, {
    method: 'DELETE',
  });

  return response;
};
