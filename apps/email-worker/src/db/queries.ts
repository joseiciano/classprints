import type { Sql } from '@classprints/server/db';
import type { JobRecord, JobStatusMetadata, SeatingResult } from '../types';

export type EmailDeliveryEligibility =
  | 'eligible'
  | 'no_subscription'
  | 'notifications_disabled'
  | 'profile_missing';

export async function checkEmailDeliveryEligibility(
  sql: Sql,
  userId: string,
): Promise<EmailDeliveryEligibility> {
  const subscriptionRows = await sql`
    select status from subscriptions where user_id = ${userId} limit 1
  `;
  const subscription = subscriptionRows[0] as { status: string } | undefined;

  if (!subscription || subscription.status !== 'active') {
    return 'no_subscription';
  }

  const profileRows = await sql`
    select email_notifications_enabled_at from user_profiles where id = ${userId} limit 1
  `;
  const profile = profileRows[0] as
    | { email_notifications_enabled_at: Date | string | null }
    | undefined;

  if (!profile) {
    return 'profile_missing';
  }

  if (profile.email_notifications_enabled_at === null) {
    return 'notifications_disabled';
  }

  return 'eligible';
}

interface JobRow {
  id: string;
  external_id: string;
  user_id: string;
  email: string;
  students: string[] | string;
  seating_grid: boolean[][] | string;
  conflicts: Record<string, string[]> | string;
  works_well_with: Record<string, string[]> | string | null;
  works_well_with_strong: Record<string, string[]> | string | null;
  seat_contenders: Record<string, [number, number][]> | string | null;
  max_results: number;
  algorithm: JobRecord['algorithm'];
  idempotency_key: string;
  status: string;
  status_metadata: JobStatusMetadata | string | null;
  results_count: number;
  created_at: number | string;
  updated_at: number | string;
  email_sent_at: number | string | null;
  error_message: string | null;
}

interface ResultRow {
  id: number | string;
  job_id: string;
  arrangement: (string | null)[][] | string;
  fitness_score: number;
  arrangement_hash: string;
  created_at: number | string;
}

export class EmailJobStore {
  constructor(private readonly sql: Sql) {}

  async getJob(jobId: string): Promise<JobRecord | null> {
    const rows = await this.sql`select * from jobs where id = ${jobId} limit 1`;
    const row = rows[0] as JobRow | undefined;
    return row ? mapJobRow(row) : null;
  }

  async getResults(jobId: string): Promise<SeatingResult[]> {
    const rows = await this.sql`
      select * from seating_results
      where job_id = ${jobId}
      order by fitness_score desc, created_at asc
    `;
    return (rows as unknown as ResultRow[]).map(mapResultRow);
  }

  async markEmailSent(jobId: string): Promise<void> {
    await this.sql`
      update jobs set email_sent_at = ${Date.now()}, updated_at = ${Date.now()}
      where id = ${jobId}
    `;
  }
}

const parseJson = <T>(value: T | string | null, fallback: T): T => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value;
};

const parseNumber = (value: number | string | null): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const mapJobRow = (row: JobRow): JobRecord => ({
  id: row.id,
  externalId: row.external_id,
  userId: row.user_id,
  email: row.email,
  students: parseJson(row.students, [] as string[]),
  seatingGrid: parseJson(row.seating_grid, [] as boolean[][]),
  conflicts: parseJson(row.conflicts, {} as Record<string, string[]>),
  worksWellWithSoft: parseJson(row.works_well_with, {} as Record<string, string[]>),
  worksWellWithStrong: parseJson(row.works_well_with_strong, {} as Record<string, string[]>),
  seatContenders: parseJson(row.seat_contenders, {} as Record<string, [number, number][]>),
  algorithm: row.algorithm,
  maxResults: row.max_results,
  idempotencyKey: row.idempotency_key,
  status: row.status as JobRecord['status'],
  statusMetadata: parseJson(row.status_metadata, null),
  resultsCount: row.results_count,
  createdAt: parseNumber(row.created_at) ?? 0,
  updatedAt: parseNumber(row.updated_at) ?? 0,
  emailSentAt: parseNumber(row.email_sent_at),
  errorMessage: row.error_message,
});

const mapResultRow = (row: ResultRow): SeatingResult => ({
  id: typeof row.id === 'string' ? Number(row.id) : row.id,
  jobId: row.job_id,
  arrangement: parseJson(row.arrangement, [] as (string | null)[][]),
  fitnessScore: row.fitness_score,
  arrangementHash: row.arrangement_hash,
  createdAt: parseNumber(row.created_at) ?? 0,
});
