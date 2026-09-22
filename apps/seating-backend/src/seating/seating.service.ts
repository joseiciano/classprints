import type { Queue } from '@cloudflare/workers-types';
import type { Sql } from '@classprints/server/db';
import {
  countActiveSeats,
  validateSeatingRequest,
  SUBSCRIPTION_LIMITS,
} from '@classprints/seating-shared';
import { sha256 } from '../utils/hash';
import { generateExternalId } from '../utils/external-id';
import { buildArrangementGridLog } from '../utils/arrangement-log';
import { createSeatingRepository } from './seating.db';
import type { InsertSeatingJob, InsertSeatingConfig, SeatingRepository } from './seating.db';
import type {
  SeatingRequest,
  SeatingJobSummary,
  SeatingJobStatusResponse,
  SeatingResultsResponse,
  SeatingJob,
  SeatingResult,
  SeatingJobQueueMessage,
  SeatingConfig,
  CreateSeatingConfigPayload,
  UpdateSeatingConfigPayload,
} from '@classprints/seating-shared';
import { BillingService } from '@classprints/server/billing';
import { HttpError } from '../lib/http-error';

export interface SeatingQueueProducer {
  send: (message: SeatingJobQueueMessage) => Promise<void>;
}

export interface AnalyticsClient {
  trackJobCreated?: (jobId: string, studentCount: number, totalSeats: number) => void;
}

export interface SeatingServiceDeps {
  repo: SeatingRepository;
  queue: SeatingQueueProducer;
  billing: BillingService;
  analytics?: AnalyticsClient;
  now?: () => number;
}

type NormalizedSeatingRequest = SeatingRequest & { email: string };

export class SeatingService {
  constructor(private readonly deps: SeatingServiceDeps) {}

  private static readonly INTERNAL_EMAIL = 'hidden@classprints.local';

  static fromBindings(bindings: {
    sql: Sql;
    QUEUE: Queue<{ jobId: string }>;
    billing: BillingService;
    analytics?: AnalyticsClient;
  }) {
    const repo = createSeatingRepository(bindings.sql);
    const queue: SeatingQueueProducer = {
      send: async (message) => {
        await bindings.QUEUE.send(message);
      },
    };
    return new SeatingService({
      repo,
      queue,
      billing: bindings.billing,
      analytics: bindings.analytics,
    });
  }

  async createJob(payload: unknown, userId: string) {
    const request = validateSeatingRequest(payload);
    const normalized = this.normalizeRequest(request);
    const idempotencyKey = await this.deriveIdempotencyKey(normalized);
    const existingJob = await this.deps.repo.findJobByIdempotency(userId, idempotencyKey);

    const totalSeats = countActiveSeats(normalized.seatingGrid);
    const now = this.deps.now?.() ?? Date.now();

    if (existingJob) {
      const summary = this.buildSummary(existingJob, totalSeats);
      return { job: existingJob, summary, isDuplicate: true } as const;
    }

    // Entitlement checks
    const subscription = await this.deps.billing.getSubscription(userId);
    const tier = subscription.tier as keyof typeof SUBSCRIPTION_LIMITS;
    const limits = SUBSCRIPTION_LIMITS[tier];

    // Gate AI generation to Plus subscribers
    if (normalized.algorithm === 'llm' && !limits.canUseAiGeneration) {
      throw new HttpError(
        403,
        'Plan limit exceeded: AI Powered (LLM) generation is only available on the Plus tier.',
      );
    }

    // Limit results (arrangements per run)
    if (normalized.results > limits.maxResultsPerRun) {
      throw new HttpError(
        403,
        `Plan limit exceeded: ${tier} tier allows up to ${limits.maxResultsPerRun} arrangements per run.`,
      );
    }

    // Limit arrangements per week
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const weeklyJobCount = await this.deps.repo.countJobsSince(userId, oneWeekAgo);

    if (weeklyJobCount >= limits.arrangementsPerWeek) {
      throw new HttpError(
        403,
        `Plan limit exceeded: ${tier} tier allows up to ${limits.arrangementsPerWeek} arrangements per week. You have already created ${weeklyJobCount} jobs in the last 7 days.`,
      );
    }

    const jobRecord: InsertSeatingJob = {
      id: crypto.randomUUID(),
      externalId: generateExternalId(),
      userId,
      email: normalized.email,
      students: normalized.students,
      conflicts: normalized.conflicts,
      worksWellWithSoft: normalized.worksWellWithSoft,
      worksWellWithStrong: normalized.worksWellWithStrong,
      seatContenders: normalized.seatContenders,
      seatingGrid: normalized.seatingGrid,
      maxResults: normalized.results ?? 1,
      algorithm: normalized.algorithm ?? 'genetic',
      idempotencyKey,
      status: 'pending',
      errorMessage: null,
      resultsCount: 0,
      statusMetadata: null,
      emailSentAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const job = await this.deps.repo.insertJob(jobRecord);

    console.log('Job created — configuration summary', {
      jobId: job.id,
      email: job.email,
      studentCount: job.students.length,
      conflictCount: Object.values(job.conflicts).reduce((sum, c) => sum + c.length, 0),
      worksWellCount:
        Object.values(job.worksWellWithSoft).reduce((sum, c) => sum + c.length, 0) +
        Object.values(job.worksWellWithStrong).reduce((sum, c) => sum + c.length, 0),
      gridDimensions: `${job.seatingGrid.length}x${job.seatingGrid[0]?.length ?? 0}`,
      maxResults: job.maxResults,
      totalSeats,
    });

    await this.deps.queue.send({ jobId: job.id });
    this.deps.analytics?.trackJobCreated?.(job.id, job.students.length, totalSeats);
    const summary = this.buildSummary(job, totalSeats);
    return { job, summary, isDuplicate: false } as const;
  }

  async getJobStatus(externalId: string): Promise<SeatingJobStatusResponse | null> {
    const job = await this.deps.repo.findJobByExternalId(externalId);
    if (!job) return null;

    return {
      jobId: job.externalId,
      status: job.status,
      algorithm: job.algorithm,
      resultsCount: job.resultsCount,
      maxResults: job.maxResults,
      createdAt: new Date(job.createdAt).toISOString(),
      updatedAt: new Date(job.updatedAt).toISOString(),
      statusMetadata: job.statusMetadata,
      error: job.errorMessage ?? undefined,
    } satisfies SeatingJobStatusResponse;
  }

  async getJobResults(externalId: string, userId: string): Promise<SeatingResultsResponse | null> {
    const job = await this.deps.repo.findJobByExternalId(externalId);
    if (!job) return null;

    // Entitlement: ownership check
    if (job.userId !== userId) {
      throw new HttpError(403, 'Forbidden: job does not belong to user');
    }

    const subscription = await this.deps.billing.getSubscription(userId);
    const tier = subscription.tier as keyof typeof SUBSCRIPTION_LIMITS;
    const visibilityDays = SUBSCRIPTION_LIMITS[tier].visibilityDays;
    if (visibilityDays !== null) {
      const visibilityWindow = visibilityDays * 24 * 60 * 60 * 1000;
      const threshold = (this.deps.now?.() ?? Date.now()) - visibilityWindow;
      if (job.createdAt < threshold) {
        throw new HttpError(
          403,
          `This chart is outside the Free plan's ${visibilityDays}-day visibility window.`,
        );
      }
    }

    const results = await this.deps.repo.listResults(job.id);
    this.logFinalResults(job, results);

    return {
      jobId: job.externalId,
      status: job.status,
      algorithm: job.algorithm,
      statusMetadata: job.statusMetadata,
      results: results.map((result) => ({
        arrangement: result.arrangement,
        fitnessScore: result.fitnessScore,
        createdAt: new Date(result.createdAt).toISOString(),
      })),
      error: job.errorMessage ?? undefined,
    } satisfies SeatingResultsResponse;
  }

  async listJobs(userId: string, limit = 20): Promise<SeatingJobSummary[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    let jobs = await this.deps.repo.listJobs(userId, safeLimit);

    // Entitlement: visibility check
    const subscription = await this.deps.billing.getSubscription(userId);
    const tier = subscription.tier as keyof typeof SUBSCRIPTION_LIMITS;
    const limits = SUBSCRIPTION_LIMITS[tier];

    if (limits.visibilityDays !== null) {
      const visibilityWindow = limits.visibilityDays * 24 * 60 * 60 * 1000;
      const threshold = (this.deps.now?.() ?? Date.now()) - visibilityWindow;
      jobs = jobs.filter((job) => job.createdAt >= threshold);
    }

    return jobs.map((job) => this.buildSummary(job, countActiveSeats(job.seatingGrid)));
  }

  async getJobSummary(externalId: string): Promise<SeatingJobSummary | null> {
    const job = await this.deps.repo.findJobByExternalId(externalId);
    if (!job) {
      return null;
    }
    return this.buildSummary(job, countActiveSeats(job.seatingGrid));
  }

  private normalizeRequest(request: SeatingRequest): NormalizedSeatingRequest {
    const resolvedEmail = request.email?.trim().toLowerCase() || SeatingService.INTERNAL_EMAIL;
    return {
      ...request,
      email: resolvedEmail,
      students: request.students.map((student) => student.trim()),
      conflicts: Object.fromEntries(
        Object.entries(request.conflicts).map(([student, conflicts]) => [
          student.trim(),
          conflicts.map((conflict) => conflict.trim()),
        ]),
      ),
      worksWellWithSoft: Object.fromEntries(
        Object.entries(request.worksWellWithSoft ?? {}).map(([student, partners]) => [
          student.trim(),
          partners.map((partner) => partner.trim()),
        ]),
      ),
      worksWellWithStrong: Object.fromEntries(
        Object.entries(request.worksWellWithStrong ?? {}).map(([student, partners]) => [
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
      seatingGrid: request.seatingGrid.map((row) => [...row]),
      algorithm: request.algorithm ?? 'genetic',
      results: request.results ?? 1,
    };
  }

  private async deriveIdempotencyKey(request: NormalizedSeatingRequest): Promise<string> {
    const sortedStudents = [...request.students].sort((a, b) => a.localeCompare(b));
    const sortedConflicts = Object.entries(request.conflicts)
      .map(
        ([student, conflicts]) =>
          [student, [...conflicts].sort((a, b) => a.localeCompare(b))] as const,
      )
      .sort((a, b) => a[0].localeCompare(b[0]));
    const sortedWorksWellSoft = Object.entries(request.worksWellWithSoft ?? {})
      .map(
        ([student, partners]) =>
          [student, [...partners].sort((a, b) => a.localeCompare(b))] as const,
      )
      .sort((a, b) => a[0].localeCompare(b[0]));
    const sortedWorksWellStrong = Object.entries(request.worksWellWithStrong ?? {})
      .map(
        ([student, partners]) =>
          [student, [...partners].sort((a, b) => a.localeCompare(b))] as const,
      )
      .sort((a, b) => a[0].localeCompare(b[0]));
    const sortedSeatContenders = Object.entries(request.seatContenders ?? {})
      .map(
        ([student, coords]) =>
          [
            student,
            [...coords]
              .sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]))
              .map((c) => c.join(',')),
          ] as const,
      )
      .sort((a, b) => a[0].localeCompare(b[0]));
    const normalizedGrid = request.seatingGrid
      .map((row) => row.map((cell) => (cell ? '1' : '0')).join(''))
      .join('|');

    const payload = [
      request.email.toLowerCase(),
      sortedStudents.join(','),
      sortedConflicts.map(([student, conflicts]) => `${student}:${conflicts.join(',')}`).join(';'),
      sortedWorksWellSoft
        .map(([student, partners]) => `${student}:${partners.join(',')}`)
        .join(';'),
      sortedWorksWellStrong
        .map(([student, partners]) => `${student}:${partners.join(',')}`)
        .join(';'),
      sortedSeatContenders.map(([student, coords]) => `${student}:${coords.join(';')}`).join('|'),
      normalizedGrid,
      request.algorithm ?? 'genetic',
      String(request.results ?? 1),
    ].join('|');

    return sha256(payload);
  }

  private buildSummary(job: SeatingJob, totalSeats: number): SeatingJobSummary {
    const conflictCount = Object.values(job.conflicts).reduce(
      (acc, conflicts) => acc + conflicts.length,
      0,
    );
    const estimatedDurationMs = this.estimateProcessingTime(job);
    return {
      jobId: job.externalId,
      status: job.status,
      algorithm: job.algorithm,
      email: null,
      studentCount: job.students.length,
      totalSeats,
      conflictCount,
      estimatedResultsAt:
        job.status === 'pending'
          ? new Date(job.createdAt + estimatedDurationMs).toISOString()
          : null,
      statusMetadata: job.statusMetadata,
      createdAt: new Date(job.createdAt).toISOString(),
      updatedAt: new Date(job.updatedAt).toISOString(),
    } satisfies SeatingJobSummary;
  }

  private estimateProcessingTime(job: SeatingJob): number {
    const baseMs = 30_000;
    const perResultMs = 15_000 * job.maxResults;
    const perStudentMs = 500 * job.students.length;
    return baseMs + perResultMs + perStudentMs;
  }

  private logFinalResults(job: SeatingJob, results: SeatingResult[]) {
    const arrangements = results.map((result, index) => ({
      option: index + 1,
      fitnessScore: result.fitnessScore,
      grid: buildArrangementGridLog(job.seatingGrid, result.arrangement),
    }));

    console.log(
      'Job results fetched — seating grids ready for downstream delivery',
      JSON.stringify(
        {
          jobId: job.id,
          status: job.status,
          arrangements,
        },
        null,
        2,
      ),
    );
  }
}

export interface SeatingConfigServiceDeps {
  repo: SeatingRepository;
  billing: BillingService;
  now?: () => number;
}

export class SeatingConfigService {
  constructor(private readonly deps: SeatingConfigServiceDeps) {}

  static fromBindings(bindings: {
    sql: Sql;
    billing: BillingService;
    analytics?: AnalyticsClient;
  }) {
    const repo = createSeatingRepository(bindings.sql);
    return new SeatingConfigService({ repo, billing: bindings.billing });
  }

  async createConfig(userId: string, payload: CreateSeatingConfigPayload) {
    // Entitlement: Saved profiles check
    const subscription = await this.deps.billing.getSubscription(userId);
    const tier = subscription.tier as keyof typeof SUBSCRIPTION_LIMITS;
    const limits = SUBSCRIPTION_LIMITS[tier];

    if (!limits.canSaveProfiles) {
      throw new HttpError(
        403,
        `Plan limit exceeded: Saved profiles are only available on the Plus tier.`,
      );
    }

    const now = this.deps.now?.() ?? Date.now();
    const config = {
      id: crypto.randomUUID(),
      userId,
      name: payload.name.trim(),
      students: payload.students.map((s) => s.trim()),
      conflicts: payload.conflicts ?? {},
      worksWellWithSoft: payload.worksWellWithSoft ?? {},
      worksWellWithStrong: payload.worksWellWithStrong ?? {},
      seatContenders: payload.seatContenders ?? {},
      seatingGrid: payload.seatingGrid,
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.deps.repo.insertConfig(config);
    console.log('Config created', {
      configId: created.id,
      userId: created.userId,
      name: created.name,
      studentCount: created.students.length,
    });
    return created;
  }

  async getConfig(id: string): Promise<SeatingConfig | null> {
    return this.deps.repo.findConfigById(id);
  }

  async listConfigs(userId: string, limit = 100): Promise<SeatingConfig[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    return this.deps.repo.findConfigsByUserId(userId, safeLimit);
  }

  async updateConfig(id: string, userId: string, payload: UpdateSeatingConfigPayload) {
    const existing = await this.deps.repo.findConfigById(id);
    if (!existing) {
      return null;
    }
    if (existing.userId !== userId) {
      throw new Error('Unauthorized: config does not belong to user');
    }

    const updateData: Partial<InsertSeatingConfig> = {};
    if (payload.name !== undefined) updateData.name = payload.name.trim();
    if (payload.students !== undefined) updateData.students = payload.students.map((s) => s.trim());
    if (payload.conflicts !== undefined) updateData.conflicts = payload.conflicts;
    if (payload.worksWellWithSoft !== undefined)
      updateData.worksWellWithSoft = payload.worksWellWithSoft;
    if (payload.worksWellWithStrong !== undefined)
      updateData.worksWellWithStrong = payload.worksWellWithStrong;
    if (payload.seatContenders !== undefined) updateData.seatContenders = payload.seatContenders;
    if (payload.seatingGrid !== undefined) updateData.seatingGrid = payload.seatingGrid;

    return this.deps.repo.updateConfig(id, updateData);
  }

  async deleteConfig(id: string, userId: string): Promise<boolean> {
    const existing = await this.deps.repo.findConfigById(id);
    if (!existing) {
      return false;
    }
    if (existing.userId !== userId) {
      throw new Error('Unauthorized: config does not belong to user');
    }
    return this.deps.repo.deleteConfig(id);
  }
}
