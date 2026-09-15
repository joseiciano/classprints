import type { Queue } from '@cloudflare/workers-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/index';
import type { InsertSeatingJob, SeatingRepository } from '../src/seating/seating.db';
import type { SeatingJob, SeatingResult } from '@classprints/seating-shared';
import type { BillingService } from '@classprints/server/billing';
import type * as BillingModule from '@classprints/server/billing';

class RouteTestRepository implements SeatingRepository {
  private jobs = new Map<string, SeatingJob>();
  private results = new Map<string, SeatingResult[]>();

  reset() {
    this.jobs.clear();
    this.results.clear();
  }

  async findJobById(jobId: string) {
    return this.jobs.get(jobId) ?? null;
  }

  async findJobByExternalId(externalId: string) {
    for (const job of this.jobs.values()) {
      if (job.externalId === externalId) {
        return job;
      }
    }
    return null;
  }

  async findJobByIdempotency(userId: string, idempotencyKey: string) {
    for (const job of this.jobs.values()) {
      if (job.userId === userId && job.idempotencyKey === idempotencyKey) {
        return job;
      }
    }
    return null;
  }

  async insertJob(job: InsertSeatingJob) {
    const stored: SeatingJob = {
      ...job,
      statusMetadata: job.statusMetadata ?? null,
    };
    this.jobs.set(job.id, stored);
    return stored;
  }

  async listResults(jobId: string) {
    return this.results.get(jobId) ?? [];
  }

  async listJobs(userId: string, limit: number) {
    return Array.from(this.jobs.values())
      .filter((job) => job.userId === userId)
      .slice(0, limit);
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

  seedResult(result: SeatingResult) {
    const current = this.results.get(result.jobId) ?? [];
    current.push(result);
    this.results.set(result.jobId, current);
  }

  firstJob() {
    return this.jobs.values().next().value ?? null;
  }
}

const repo = new RouteTestRepository();

vi.mock('../src/seating/seating.db', async () => {
  const actual = await vi.importActual<typeof import('../src/seating/seating.db')>(
    '../src/seating/seating.db',
  );
  return {
    ...actual,
    createSeatingRepository: () => repo,
  };
});

// Mock BillingService
vi.mock('@classprints/server/billing', async () => {
  const actual = await vi.importActual<typeof BillingModule>('@classprints/server/billing');
  return {
    ...actual,
    BillingService: class MockBillingService {
      getSubscription = vi.fn().mockResolvedValue({ tier: 'plus' });
    },
  };
});

describe('Seating Routes', () => {
  const app = buildApp();
  let queueSend: ReturnType<typeof vi.fn>;

  const createEnv = () => ({
    ENVIRONMENT: 'test',
    APPLICATION_NAME: 'Seating Backend',
    FRONTEND_URL: 'http://localhost:5173',
    ALLOWED_ORIGINS: 'http://localhost:5173',
    HYPERDRIVE: { connectionString: 'postgres://user:pass@localhost:5432/db' } as never,
    STRIPE_SECRET_KEY: 'sk_test_mock',
    SEATING_JOBS: {
      send: async (message: unknown) => queueSend(message),
    } as unknown as Queue<{ jobId: string }>,
  });

  beforeEach(() => {
    repo.reset();
    queueSend = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('accepts valid request and returns summary', async () => {
    const payload = createPayload();
    const req = new Request('http://localhost/api/v1/seating', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await app.fetch(req, createEnv() as any);
    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data.data.email).toBeNull();
    expect(queueSend).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid payload', async () => {
    const payload = { ...createPayload(), email: 'not-an-email' };
    const req = new Request('http://localhost/api/v1/seating', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await app.fetch(req, createEnv() as any);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Validation failed');
  });

  it('returns job status', async () => {
    const payload = createPayload();
    await app.fetch(
      new Request('http://localhost/api/v1/seating', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
      }),
      createEnv() as any,
    );

    const firstJob = repo.firstJob();
    if (!firstJob) throw new Error('job missing');
    const res = await app.fetch(
      new Request(`http://localhost/api/v1/seating/${firstJob.externalId}`),
      createEnv() as any,
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.jobId).toBe(firstJob.externalId);
  });

  it('returns job results', async () => {
    const payload = createPayload();
    await app.fetch(
      new Request('http://localhost/api/v1/seating', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
      }),
      createEnv() as any,
    );

    const job = repo.firstJob();
    if (!job) throw new Error('job missing');
    repo.seedResult({
      id: 1,
      jobId: job.id,
      arrangement: [['Alice', 'Bob']],
      fitnessScore: 0.95,
      arrangementHash: 'hash',
      createdAt: Date.now(),
    });

    const res = await app.fetch(
      new Request(`http://localhost/api/v1/seating/${job.externalId}/results`),
      createEnv() as any,
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results).toHaveLength(1);
    expect(data.results[0].fitnessScore).toBeCloseTo(0.95);
  });

  it('lists recent jobs', async () => {
    const payload = createPayload();
    await app.fetch(
      new Request('http://localhost/api/v1/seating', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
      }),
      createEnv() as any,
    );

    const res = await app.fetch(new Request('http://localhost/api/v1/seating'), createEnv() as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data).toHaveLength(1);
    expect(data.data[0].email).toBeNull();
  });

  it('returns job summary for a given jobId', async () => {
    const payload = createPayload();
    await app.fetch(
      new Request('http://localhost/api/v1/seating', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
      }),
      createEnv() as any,
    );

    const job = repo.firstJob();
    if (!job) throw new Error('job missing');

    const res = await app.fetch(
      new Request(`http://localhost/api/v1/seating/${job.externalId}/summary`),
      createEnv() as any,
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.jobId).toBe(job.externalId);
  });
});

const createPayload = () => ({
  students: ['Alice', 'Bob'],
  conflicts: { Alice: ['Bob'], Bob: ['Alice'] },
  worksWellWithSoft: { Alice: ['Bob'], Bob: [] },
  worksWellWithStrong: {},
  seatingGrid: [
    [true, true],
    [true, true],
  ],
  results: 1,
});
