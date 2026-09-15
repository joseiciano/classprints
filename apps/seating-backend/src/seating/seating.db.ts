import type { Sql } from '@classprints/server/db';
import type {
  ConflictMap,
  JobStatus,
  JobStatusMetadata,
  SeatingGrid,
  SeatingJob,
  SeatingRequest,
  SeatingResult,
  WorksWellWithMap,
  Algorithm,
  SeatContenders,
  SeatingConfig,
} from '@classprints/seating-shared';

export interface InsertSeatingJob {
  id: string;
  externalId: string;
  userId: string;
  email: string;
  students: string[];
  conflicts: ConflictMap;
  worksWellWithSoft: WorksWellWithMap;
  worksWellWithStrong: WorksWellWithMap;
  seatContenders: SeatContenders;
  seatingGrid: SeatingGrid;
  maxResults: number;
  algorithm: Algorithm;
  idempotencyKey: string;
  status: JobStatus;
  errorMessage: string | null;
  resultsCount: number;
  statusMetadata: JobStatusMetadata | null;
  emailSentAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface InsertSeatingConfig {
  id: string;
  userId: string;
  name: string;
  students: string[];
  conflicts: ConflictMap;
  worksWellWithSoft: WorksWellWithMap;
  worksWellWithStrong: WorksWellWithMap;
  seatContenders: SeatContenders;
  seatingGrid: SeatingGrid;
  createdAt: number;
  updatedAt: number;
}

export interface SeatingRepository {
  findJobById(jobId: string): Promise<SeatingJob | null>;
  findJobByExternalId(externalId: string): Promise<SeatingJob | null>;
  findJobByIdempotency(userId: string, idempotencyKey: string): Promise<SeatingJob | null>;
  insertJob(job: InsertSeatingJob): Promise<SeatingJob>;
  listResults(jobId: string): Promise<SeatingResult[]>;
  listJobs(userId: string, limit: number): Promise<SeatingJob[]>;
  countJobsSince(userId: string, since: number): Promise<number>;
  findConfigById(id: string): Promise<SeatingConfig | null>;
  findConfigsByUserId(userId: string, limit: number): Promise<SeatingConfig[]>;
  insertConfig(config: InsertSeatingConfig): Promise<SeatingConfig>;
  updateConfig(id: string, config: Partial<InsertSeatingConfig>): Promise<SeatingConfig | null>;
  deleteConfig(id: string): Promise<boolean>;
}

interface SeatingJobRow {
  id: string;
  external_id: string;
  user_id: string;
  email: string;
  students: string[] | string;
  conflicts: ConflictMap | string;
  works_well_with: WorksWellWithMap | string | null;
  works_well_with_strong: WorksWellWithMap | string | null;
  seat_contenders: SeatContenders | string | null;
  seating_grid: SeatingGrid | string;
  max_results: number;
  algorithm: Algorithm;
  idempotency_key: string;
  status: JobStatus;
  error_message: string | null;
  results_count: number;
  status_metadata: JobStatusMetadata | string | null;
  email_sent_at: number | string | null;
  created_at: number | string;
  updated_at: number | string;
}

interface SeatingResultRow {
  id: number | string;
  job_id: string;
  arrangement: (string | null)[][] | string;
  fitness_score: number;
  arrangement_hash: string;
  created_at: number | string;
}

interface SeatingConfigRow {
  id: string;
  user_id: string;
  name: string;
  students: string[] | string;
  conflicts: ConflictMap | string;
  works_well_with_soft: WorksWellWithMap | string | null;
  works_well_with_strong: WorksWellWithMap | string | null;
  seat_contenders: SeatContenders | string | null;
  seating_grid: SeatingGrid | string;
  created_at: number | string;
  updated_at: number | string;
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

const mapJobRow = (row: SeatingJobRow): SeatingJob => ({
  id: row.id,
  externalId: row.external_id,
  userId: row.user_id,
  email: row.email,
  students: parseJson(row.students, []),
  conflicts: parseJson(row.conflicts, {} as ConflictMap),
  worksWellWithSoft: parseJson(row.works_well_with, {} as WorksWellWithMap),
  worksWellWithStrong: parseJson(row.works_well_with_strong, {} as WorksWellWithMap),
  seatContenders: parseJson(row.seat_contenders, {} as SeatContenders),
  seatingGrid: parseJson(row.seating_grid, [] as SeatingGrid),
  maxResults: row.max_results,
  algorithm: row.algorithm,
  idempotencyKey: row.idempotency_key,
  status: row.status,
  errorMessage: row.error_message,
  resultsCount: row.results_count,
  statusMetadata: parseJson(row.status_metadata, null),
  emailSentAt: parseNumber(row.email_sent_at),
  createdAt: parseNumber(row.created_at) ?? 0,
  updatedAt: parseNumber(row.updated_at) ?? 0,
});

const mapResultRow = (row: SeatingResultRow): SeatingResult => ({
  id: typeof row.id === 'string' ? Number(row.id) : row.id,
  jobId: row.job_id,
  arrangement: parseJson(row.arrangement, [] as (string | null)[][]),
  fitnessScore: row.fitness_score,
  arrangementHash: row.arrangement_hash,
  createdAt: parseNumber(row.created_at) ?? 0,
});

const mapConfigRow = (row: SeatingConfigRow): SeatingConfig => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  students: parseJson(row.students, []),
  conflicts: parseJson(row.conflicts, {} as ConflictMap),
  worksWellWithSoft: parseJson(row.works_well_with_soft, {} as WorksWellWithMap),
  worksWellWithStrong: parseJson(row.works_well_with_strong, {} as WorksWellWithMap),
  seatContenders: parseJson(row.seat_contenders, {} as SeatContenders),
  seatingGrid: parseJson(row.seating_grid, [] as SeatingGrid),
  createdAt: parseNumber(row.created_at) ?? 0,
  updatedAt: parseNumber(row.updated_at) ?? 0,
});

const jobColumns =
  'id, external_id, user_id, email, students, conflicts, works_well_with, works_well_with_strong, seat_contenders, seating_grid, max_results, algorithm, idempotency_key, status, error_message, results_count, status_metadata, email_sent_at, created_at, updated_at';

export const createSeatingRepository = (sql: Sql): SeatingRepository => ({
  async findJobById(jobId) {
    const rows = await sql`
      select ${sql(jobColumns)} from jobs where id = ${jobId} limit 1
    `;
    const row = rows[0] as SeatingJobRow | undefined;
    return row ? mapJobRow(row) : null;
  },

  async findJobByExternalId(externalId) {
    const rows = await sql`
      select ${sql(jobColumns)} from jobs where external_id = ${externalId} limit 1
    `;
    const row = rows[0] as SeatingJobRow | undefined;
    return row ? mapJobRow(row) : null;
  },

  async findJobByIdempotency(userId, idempotencyKey) {
    const rows = await sql`
      select ${sql(jobColumns)} from jobs
      where user_id = ${userId} and idempotency_key = ${idempotencyKey}
      limit 1
    `;
    const row = rows[0] as SeatingJobRow | undefined;
    return row ? mapJobRow(row) : null;
  },

  async insertJob(job) {
    const rows = await sql`
      insert into jobs (
        id, external_id, user_id, email, students, conflicts,
        works_well_with, works_well_with_strong, seat_contenders, seating_grid,
        max_results, algorithm, idempotency_key, status, error_message,
        results_count, status_metadata, email_sent_at, created_at, updated_at
      ) values (
        ${job.id}, ${job.externalId}, ${job.userId}, ${job.email},
        ${sql.json(job.students)}, ${sql.json(job.conflicts)},
        ${sql.json(job.worksWellWithSoft ?? {})}, ${sql.json(job.worksWellWithStrong ?? {})},
        ${sql.json(job.seatContenders ?? {})}, ${sql.json(job.seatingGrid)},
        ${job.maxResults}, ${job.algorithm}, ${job.idempotencyKey}, ${job.status},
        ${job.errorMessage}, ${job.resultsCount}, ${job.statusMetadata === null ? null : sql.json(job.statusMetadata)},
        ${job.emailSentAt}, ${job.createdAt}, ${job.updatedAt}
      )
      returning ${sql(jobColumns)}
    `;
    const row = rows[0] as SeatingJobRow | undefined;
    if (!row) {
      throw new Error('Unable to create job');
    }
    return mapJobRow(row);
  },

  async listResults(jobId) {
    const rows = await sql`
      select id, job_id, arrangement, fitness_score, arrangement_hash, created_at
      from seating_results where job_id = ${jobId}
      order by created_at desc
    `;
    return (rows as unknown as SeatingResultRow[]).map(mapResultRow);
  },

  async listJobs(userId, limit) {
    const rows = await sql`
      select ${sql(jobColumns)} from jobs
      where user_id = ${userId}
      order by created_at desc
      limit ${limit}
    `;
    return (rows as unknown as SeatingJobRow[]).map(mapJobRow);
  },

  async countJobsSince(userId, since) {
    const rows = await sql`
      select count(*)::int as total from jobs
      where user_id = ${userId} and created_at >= ${since}
    `;
    const row = rows[0] as { total: number } | undefined;
    return row?.total ?? 0;
  },

  async findConfigById(id) {
    const rows = await sql`
      select id, user_id, name, students, conflicts, works_well_with_soft,
             works_well_with_strong, seat_contenders, seating_grid, created_at, updated_at
      from seating_configs where id = ${id} limit 1
    `;
    const row = rows[0] as SeatingConfigRow | undefined;
    return row ? mapConfigRow(row) : null;
  },

  async findConfigsByUserId(userId, limit) {
    const rows = await sql`
      select id, user_id, name, students, conflicts, works_well_with_soft,
             works_well_with_strong, seat_contenders, seating_grid, created_at, updated_at
      from seating_configs
      where user_id = ${userId}
      order by created_at desc
      limit ${limit}
    `;
    return (rows as unknown as SeatingConfigRow[]).map(mapConfigRow);
  },

  async insertConfig(config) {
    const rows = await sql`
      insert into seating_configs (
        id, user_id, name, students, conflicts, works_well_with_soft,
        works_well_with_strong, seat_contenders, seating_grid, created_at, updated_at
      ) values (
        ${config.id}, ${config.userId}, ${config.name},
        ${sql.json(config.students)}, ${sql.json(config.conflicts)},
        ${sql.json(config.worksWellWithSoft)}, ${sql.json(config.worksWellWithStrong)},
        ${sql.json(config.seatContenders)}, ${sql.json(config.seatingGrid)},
        ${config.createdAt}, ${config.updatedAt}
      )
      returning id, user_id, name, students, conflicts, works_well_with_soft,
                works_well_with_strong, seat_contenders, seating_grid, created_at, updated_at
    `;
    const row = rows[0] as SeatingConfigRow | undefined;
    if (!row) {
      throw new Error('Unable to create config');
    }
    return mapConfigRow(row);
  },

  async updateConfig(id, config) {
    const updateData: Record<string, unknown> = {
      updated_at: Date.now(),
    };
    if (config.name !== undefined) updateData.name = config.name;
    if (config.students !== undefined) updateData.students = sql.json(config.students);
    if (config.conflicts !== undefined) updateData.conflicts = sql.json(config.conflicts);
    if (config.worksWellWithSoft !== undefined)
      updateData.works_well_with_soft = sql.json(config.worksWellWithSoft);
    if (config.worksWellWithStrong !== undefined)
      updateData.works_well_with_strong = sql.json(config.worksWellWithStrong);
    if (config.seatContenders !== undefined)
      updateData.seat_contenders = sql.json(config.seatContenders);
    if (config.seatingGrid !== undefined) updateData.seating_grid = sql.json(config.seatingGrid);

    const rows = await sql`
      update seating_configs set ${sql(updateData)} where id = ${id}
      returning id, user_id, name, students, conflicts, works_well_with_soft,
                works_well_with_strong, seat_contenders, seating_grid, created_at, updated_at
    `;
    const row = rows[0] as SeatingConfigRow | undefined;
    return row ? mapConfigRow(row) : null;
  },

  async deleteConfig(id) {
    await sql`delete from seating_configs where id = ${id}`;
    return true;
  },
});

export const normalizeRequest = (request: SeatingRequest) => ({
  ...request,
  students: request.students.map((student) => student.trim()),
  worksWellWithSoft: Object.fromEntries(
    Object.entries(request.worksWellWithSoft).map(([student, partners]) => [
      student.trim(),
      partners.map((partner) => partner.trim()),
    ]),
  ),
  worksWellWithStrong: Object.fromEntries(
    Object.entries(request.worksWellWithStrong).map(([student, partners]) => [
      student.trim(),
      partners.map((partner) => partner.trim()),
    ]),
  ),
  seatContenders: Object.fromEntries(
    Object.entries(request.seatContenders ?? {}).map(([student, coords]) => [
      student.trim(),
      coords,
    ]),
  ),
});
