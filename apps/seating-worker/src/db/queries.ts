import type {
  AlgorithmRunMode,
  JobRecord,
  JobStateRecord,
  JobStatus,
  JobStatusMetadata,
  JobWithState,
} from '../types';
import type { AlgorithmState, Population } from '../genetic-algorithm/types';
import { generateArrangementHash } from '../deduplication/hash';
import type { Sql } from '@classprints/server/db';

interface JobRow {
  id: string;
  external_id: string;
  user_id: string;
  email: string;
  students: string[] | string;
  conflicts: Record<string, string[]> | string;
  works_well_with: Record<string, string[]> | string | null;
  works_well_with_strong: Record<string, string[]> | string | null;
  seat_contenders: Record<string, [number, number][]> | string | null;
  seating_grid: boolean[][] | string;
  max_results: number;
  algorithm: string;
  idempotency_key: string;
  status: JobStatus;
  error_message: string | null;
  results_count: number;
  status_metadata: JobStatusMetadata | string | null;
  email_sent_at: number | string | null;
  created_at: number | string;
  updated_at: number | string;
}

interface JobStateRow {
  job_id: string;
  current_generation: number;
  population: string | null;
  best_fitness: number | null;
  reseeds: number | null;
  stagnant_generations: number | null;
  mode: AlgorithmRunMode;
  updated_at: number | string;
}

const MAX_SNAPSHOT_BYTES = 512 * 1024;

export class JobStore {
  constructor(private readonly sql: Sql) {}

  async getJobWithState(jobId: string): Promise<JobWithState | null> {
    const jobRows = await this.sql`select * from jobs where id = ${jobId} limit 1`;
    const jobRow = jobRows[0] as JobRow | undefined;
    if (!jobRow) return null;
    const stateRows = await this.sql`select * from job_states where job_id = ${jobId} limit 1`;
    const stateRow = stateRows[0] as JobStateRow | undefined;

    return {
      job: mapJobRow(jobRow),
      state: stateRow ? mapStateRow(stateRow) : null,
    } satisfies JobWithState;
  }

  async saveJobState(jobId: string, mode: AlgorithmRunMode, state: AlgorithmState): Promise<void> {
    const trimmedPopulation = trimPopulation(state.population);
    const encoded = encodePopulationBase64(trimmedPopulation);
    await this.sql`
      insert into job_states (
        job_id, current_generation, population, best_fitness,
        reseeds, stagnant_generations, mode, updated_at
      ) values (
        ${jobId}, ${state.generation}, ${encoded}, ${state.bestFitness},
        ${state.reseeds}, ${state.stagnantGenerations}, ${mode}, ${Date.now()}
      )
      on conflict (job_id) do update set
        current_generation = excluded.current_generation,
        population = excluded.population,
        best_fitness = excluded.best_fitness,
        reseeds = excluded.reseeds,
        stagnant_generations = excluded.stagnant_generations,
        mode = excluded.mode,
        updated_at = excluded.updated_at
    `;
  }

  async deleteJobState(jobId: string): Promise<void> {
    await this.sql`delete from job_states where job_id = ${jobId}`;
  }

  async updateJob(
    jobId: string,
    updates: Partial<{
      status: JobStatus;
      errorMessage: string | null;
      resultsCount: number;
      statusMetadata: JobStatusMetadata | null;
    }>,
  ) {
    const payload: Record<string, unknown> = {
      updated_at: Date.now(),
    };
    if (updates.status) {
      payload.status = updates.status;
    }
    if (updates.errorMessage !== undefined) {
      payload.error_message = updates.errorMessage;
    }
    if (updates.resultsCount !== undefined) {
      payload.results_count = updates.resultsCount;
    }
    if (updates.statusMetadata !== undefined) {
      payload.status_metadata =
        updates.statusMetadata === null ? null : this.sql.json(updates.statusMetadata);
    }
    await this.sql`update jobs set ${this.sql(payload)} where id = ${jobId}`;
  }

  async getResults(
    jobId: string,
  ): Promise<{ arrangement: (string | null)[][]; fitnessScore: number }[]> {
    const rows = await this.sql`
      select arrangement, fitness_score from seating_results
      where job_id = ${jobId}
      order by fitness_score desc
    `;
    return (rows as unknown as { arrangement: (string | null)[][] | string; fitness_score: number }[]).map(
      (row) => ({
        arrangement: parseJson(row.arrangement, [] as (string | null)[][]),
        fitnessScore: row.fitness_score,
      }),
    );
  }

  async saveArrangement(
    jobId: string,
    arrangement: (string | null)[][],
    fitnessScore: number,
  ): Promise<boolean> {
    const hash = await generateArrangementHash(arrangement);
    try {
      await this.sql`
        insert into seating_results (job_id, arrangement, fitness_score, arrangement_hash, created_at)
        values (${jobId}, ${this.sql.json(arrangement)}, ${fitnessScore}, ${hash}, ${Date.now()})
      `;
      return true;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return false;
      }
      throw new Error(
        `Unable to save arrangement: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

const mapJobRow = (row: JobRow): JobRecord => ({
  id: row.id,
  externalId: row.external_id,
  userId: row.user_id,
  email: row.email,
  students: parseJson(row.students, [] as string[]),
  conflicts: parseJson(row.conflicts, {} as Record<string, string[]>),
  worksWellWithSoft: parseJson(row.works_well_with, {} as Record<string, string[]>),
  worksWellWithStrong: parseJson(row.works_well_with_strong, {} as Record<string, string[]>),
  seatContenders: parseJson(row.seat_contenders, {} as Record<string, [number, number][]>),
  seatingGrid: parseJson(row.seating_grid, [] as boolean[][]),
  maxResults: row.max_results,
  algorithm: row.algorithm === 'llm' ? 'llm' : 'genetic',
  idempotencyKey: row.idempotency_key,
  status: row.status,
  resultsCount: row.results_count,
  statusMetadata: parseJson(row.status_metadata, null),
  errorMessage: row.error_message,
  emailSentAt: parseNumber(row.email_sent_at),
  createdAt: parseNumber(row.created_at) ?? 0,
  updatedAt: parseNumber(row.updated_at) ?? 0,
});

const mapStateRow = (row: JobStateRow): JobStateRecord => ({
  jobId: row.job_id,
  currentGeneration: row.current_generation,
  population: decodePopulationBuffer(row.population),
  bestFitness: row.best_fitness ?? 0,
  reseeds: row.reseeds ?? 0,
  stagnantGenerations: row.stagnant_generations ?? 0,
  mode: row.mode,
  updatedAt: parseNumber(row.updated_at) ?? 0,
});

const encodePopulation = (population: Population): ArrayBuffer => {
  if (population.length === 0) return new ArrayBuffer(0);
  const studentCount = population[0].length;
  const buffer = new ArrayBuffer(population.length * studentCount * Uint16Array.BYTES_PER_ELEMENT);
  const view = new Uint16Array(buffer);
  population.forEach((individual, idx) => {
    view.set(individual, idx * studentCount);
  });
  return buffer;
};

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

const bufferToBase64 = (buffer: ArrayBuffer): string => {
  if (!buffer || buffer.byteLength === 0) return '';
  const bytes = new Uint8Array(buffer);
  if (typeof btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  throw new Error('Base64 encoding not available in this runtime');
};

const base64ToBuffer = (value: string): ArrayBuffer => {
  if (!value) return new ArrayBuffer(0);
  if (typeof atob === 'function') {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
  if (typeof Buffer !== 'undefined') {
    const buffer = Buffer.from(value, 'base64');
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }
  throw new Error('Base64 decoding not available in this runtime');
};

const encodePopulationBase64 = (population: Population): string =>
  bufferToBase64(encodePopulation(population));

const decodePopulationBuffer = (value: string | null): ArrayBuffer => base64ToBuffer(value ?? '');

export const decodePopulation = (buffer: ArrayBuffer, studentCount: number): Population => {
  if (!buffer || buffer.byteLength === 0) return [];
  const view = new Uint16Array(buffer);
  const population: Population = [];
  for (let offset = 0; offset < view.length; offset += studentCount) {
    population.push(view.slice(offset, offset + studentCount));
  }
  return population;
};

const trimPopulation = (population: Population): Population => {
  if (population.length === 0) return population;
  const studentCount = population[0].length;
  let current = population;
  while (current.length * studentCount * Uint16Array.BYTES_PER_ELEMENT > MAX_SNAPSHOT_BYTES) {
    current = current.slice(0, Math.ceil(current.length / 2));
  }
  return current;
};

const isUniqueConstraintError = (error: unknown): boolean => {
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as { code?: string }).code === '23505';
  }
  return error instanceof Error && /duplicate|unique/i.test(error.message);
};

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
  const profile = profileRows[0] as { email_notifications_enabled_at: Date | string | null } | undefined;

  if (!profile) {
    return 'profile_missing';
  }

  if (profile.email_notifications_enabled_at === null) {
    return 'notifications_disabled';
  }

  return 'eligible';
}
