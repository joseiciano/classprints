import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ZodError } from 'zod';
import type { InsertSeatingJob, SeatingRepository } from '../src/seating/seating.db';
import type { SeatingJob, SeatingResult } from '@classprints/seating-shared';
import { SeatingService } from '../src/seating/seating.service';
import { HttpError } from '../src/lib/http-error';
import type { BillingService } from '@classprints/server/billing';

class InMemorySeatingRepository implements SeatingRepository {
  private jobs = new Map<string, SeatingJob>();
  private results = new Map<string, SeatingResult[]>();

  async findJobById(jobId: string) {
    return this.clone(this.jobs.get(jobId) ?? null);
  }

  async findJobByExternalId(externalId: string) {
    for (const job of this.jobs.values()) {
      if (job.externalId === externalId) {
        return this.clone(job);
      }
    }
    return null;
  }

  async findJobByIdempotency(userId: string, idempotencyKey: string) {
    for (const job of this.jobs.values()) {
      if (job.userId === userId && job.idempotencyKey === idempotencyKey) {
        return this.clone(job);
      }
    }
    return null;
  }

  async insertJob(job: InsertSeatingJob) {
    const stored = this.toJob(job);
    this.jobs.set(stored.id, this.clone(stored));
    return this.clone(stored);
  }

  async listResults(jobId: string) {
    const results = this.results.get(jobId) ?? [];
    return results.map((result) => this.clone(result));
  }

  async listJobs(userId: string, limit: number) {
    return Array.from(this.jobs.values())
      .filter((job) => job.userId === userId)
      .slice(0, limit)
      .map((j) => this.clone(j));
  }

  async countJobsSince(userId: string, since: number) {
    return Array.from(this.jobs.values()).filter(
      (job) => job.userId === userId && job.createdAt >= since,
    ).length;
  }

  async findConfigById(id: string) {
    return null;
  }

  async findConfigsByUserId(userId: string, limit: number) {
    return [];
  }

  async insertConfig(config: InsertSeatingConfig) {
    return config as SeatingConfig;
  }

  async updateConfig(id: string, config: Partial<InsertSeatingConfig>) {
    return config as SeatingConfig;
  }

  async deleteConfig(id: string) {
    return true;
  }

  seedJob(job: SeatingJob) {
    this.jobs.set(job.id, this.clone(job));
  }

  seedResults(jobId: string, records: SeatingResult[]) {
    this.results.set(
      jobId,
      records.map((record) => this.clone(record)),
    );
  }

  private clone<T>(value: T): T {
    return value
      ? structuredClone
        ? structuredClone(value)
        : JSON.parse(JSON.stringify(value))
      : (value as T);
  }

  private toJob(job: InsertSeatingJob): SeatingJob {
    return {
      ...job,
      statusMetadata: job.statusMetadata ?? null,
    };
  }
}

const baseRequest = {
  students: ['Alice', 'Bob', 'Charlie', 'Diana'],
  conflicts: {
    Alice: ['Bob'],
    Bob: ['Alice'],
    Charlie: [],
    Diana: [],
  },
  worksWellWithSoft: {
    Alice: ['Charlie'],
    Bob: [],
    Charlie: ['Diana'],
    Diana: [],
  },
  worksWellWithStrong: {},
  seatingGrid: [
    [true, true, false],
    [true, true, true],
  ],
  results: 2,
};

describe('SeatingService', () => {
  let repo: InMemorySeatingRepository;
  let queueSend: (message: { jobId: string }) => Promise<void>;
  let billing: Partial<BillingService>;
  let service: SeatingService;

  beforeEach(() => {
    repo = new InMemorySeatingRepository();
    queueSend = vi.fn().mockResolvedValue(undefined) as unknown as (message: {
      jobId: string;
    }) => Promise<void>;
    billing = {
      getSubscription: vi.fn().mockResolvedValue({ tier: 'plus' }),
    };
    service = new SeatingService({
      repo,
      queue: { send: queueSend },
      billing: billing as BillingService,
      now: () => 1_700_000_000_000,
    });
  });

  it('creates a job and enqueues message', async () => {
    const { job, summary, isDuplicate } = await service.createJob(baseRequest);

    expect(isDuplicate).toBe(false);
    expect(job.email).toBeTruthy();
    expect(queueSend).toHaveBeenCalledTimes(1);
    expect(summary.studentCount).toBe(baseRequest.students.length);
    expect(summary.totalSeats).toBe(5);
  });

  it('reuses existing job when payload is identical', async () => {
    const first = await service.createJob(baseRequest);
    const second = await service.createJob(baseRequest);

    expect(second.job.id).toBe(first.job.id);
    expect(second.isDuplicate).toBe(true);
    expect(queueSend).toHaveBeenCalledTimes(1);
  });

  it('throws validation error for invalid payload', async () => {
    await expect(
      service.createJob({ ...baseRequest, seatingGrid: [[true, false], [true]] }),
    ).rejects.toThrow('Seating grid must be rectangular');
  });

  it('validates grid capacity against student count', async () => {
    expect.assertions(2);
    try {
      await service.createJob({
        ...baseRequest,
        students: ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'],
        seatingGrid: [[true, true]],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ZodError);
      expect((error as ZodError).issues.map((issue) => issue.message)).toContain(
        'Grid rows x columns must cover all students',
      );
      return;
    }
    throw new Error('Expected grid capacity validation to fail');
  });

  it('rejects conflicts that reference non-attendees', async () => {
    expect.assertions(2);
    try {
      await service.createJob({
        ...baseRequest,
        conflicts: {
          ...baseRequest.conflicts,
          Mallory: ['Alice'],
          Alice: ['Mallory'],
        },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ZodError);
      expect((error as ZodError).issues.map((issue) => issue.message)).toContain(
        'Conflict references non-existent student: Mallory',
      );
      return;
    }
    throw new Error('Expected conflict validation to fail');
  });

  it('rejects works-well-with entries that reference non-attendees', async () => {
    expect.assertions(2);
    try {
      await service.createJob({
        ...baseRequest,
        worksWellWithSoft: {
          ...baseRequest.worksWellWithSoft,
          Alice: ['Mallory'],
        },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ZodError);
      expect((error as ZodError).issues.map((issue) => issue.message)).toContain(
        'Works-well-with references non-existent student: Mallory',
      );
      return;
    }
    throw new Error('Expected works-well-with validation to fail');
  });

  it('rejects seat contender entries that reference non-attendees', async () => {
    expect.assertions(2);
    try {
      await service.createJob({
        ...baseRequest,
        seatContenders: {
          Mallory: [[0, 0]],
        },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ZodError);
      expect((error as ZodError).issues.map((issue) => issue.message)).toContain(
        'Seat contender references non-existent student: Mallory',
      );
      return;
    }
    throw new Error('Expected seat contender validation to fail');
  });

  it('rejects seat contender entries that reference invalid coordinates', async () => {
    expect.assertions(2);
    try {
      await service.createJob({
        ...baseRequest,
        seatContenders: {
          Alice: [[10, 10]],
        },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ZodError);
      expect((error as ZodError).issues.map((issue) => issue.message)).toContain(
        'Coordinate [10, 10] is out of grid boundaries',
      );
      return;
    }
    throw new Error('Expected seat contender validation to fail');
  });

  it('rejects seat contender entries that reference inactive seats', async () => {
    expect.assertions(2);
    try {
      await service.createJob({
        ...baseRequest,
        seatContenders: {
          Alice: [[0, 2]], // grid[0][2] is false in baseRequest
        },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ZodError);
      expect((error as ZodError).issues.map((issue) => issue.message)).toContain(
        'Coordinate [0, 2] corresponds to an inactive seat',
      );
      return;
    }
    throw new Error('Expected seat contender validation to fail');
  });

  it('returns job status summary', async () => {
    const creation = await service.createJob(baseRequest);
    const status = await service.getJobStatus(creation.job.externalId);

    expect(status).not.toBeNull();
    expect(status?.jobId).toBe(creation.job.externalId);
    expect(status?.status).toBe('pending');
  });

  it('accepts lowercase workswellwith payloads for compatibility', async () => {
    const payload = {
      ...baseRequest,
      worksWellWithSoft: {},
      workswellwith: { Alice: ['Bob'] },
    } as unknown as typeof baseRequest & { workswellwith: Record<string, string[]> };

    const { job } = await service.createJob(payload);
    expect(job.worksWellWithSoft.Alice).toEqual(['Bob']);
  });

  it('returns job results data', async () => {
    const { job } = await service.createJob(baseRequest);
    const now = Date.now();
    repo.seedResults(job.id, [
      {
        id: 1,
        jobId: job.id,
        arrangement: [
          ['Alice', null, 'Bob'],
          ['Charlie', 'Diana', null],
        ],
        fitnessScore: 0.9,
        arrangementHash: 'hash-1',
        createdAt: now,
      },
    ]);

    const results = await service.getJobResults(job.externalId, job.userId);
    expect(results).not.toBeNull();
    expect(results?.results).toHaveLength(1);
    expect(results?.results[0].fitnessScore).toBeCloseTo(0.9);
  });

  it('rejects AI (LLM) generation for free tier subscribers', async () => {
    billing.getSubscription = vi.fn().mockResolvedValue({ tier: 'free' });

    expect.assertions(3);
    try {
      await service.createJob({ ...baseRequest, algorithm: 'llm' });
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).status).toBe(403);
      expect((error as HttpError).message).toContain('Plus tier');
      return;
    }
    throw new Error('Expected AI generation entitlement check to fail');
  });

  it('allows AI (LLM) generation for Plus tier subscribers', async () => {
    billing.getSubscription = vi.fn().mockResolvedValue({ tier: 'plus' });

    const { job } = await service.createJob({ ...baseRequest, algorithm: 'llm' });

    expect(job.algorithm).toBe('llm');
    expect(queueSend).toHaveBeenCalledTimes(1);
  });

  it('allows genetic algorithm for free tier subscribers', async () => {
    billing.getSubscription = vi.fn().mockResolvedValue({ tier: 'free' });

    const { job } = await service.createJob({ ...baseRequest, results: 1 });

    expect(job.algorithm).toBe('genetic');
    expect(queueSend).toHaveBeenCalledTimes(1);
  });
});
