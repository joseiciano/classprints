import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageBatch } from '@cloudflare/workers-types';
import type { SeatingJobQueueMessage } from '@classprints/seating-shared';
import { buildEmailContent } from '../src/email/formatter';
import type { EmailWorkerBindings, JobRecord, SeatingResult } from '../src/types';

// The worker opens a Postgres connection through Hyperdrive; replace the DB
// seam with an in-memory store so the real queue → formatter → sender path runs.
const db = vi.hoisted(() => ({
  jobs: new Map<string, unknown>(),
  results: new Map<string, unknown[]>(),
  sentJobIds: [] as string[],
  eligibility: 'eligible' as string,
}));

vi.mock('../src/lib/db', () => ({ createDb: () => ({}) }));

vi.mock('../src/db/queries', () => ({
  EmailJobStore: class {
    async getJob(jobId: string) {
      return db.jobs.get(jobId) ?? null;
    }
    async getResults(jobId: string) {
      return db.results.get(jobId) ?? [];
    }
    async markEmailSent(jobId: string) {
      db.sentJobIds.push(jobId);
    }
  },
  checkEmailDeliveryEligibility: async () => db.eligibility,
}));

const { default: worker } = await import('../src/index');

type SentMessage = {
  from: { email: string; name: string };
  to: string;
  subject: string;
  html: string;
  text: string;
};

class InMemorySendEmailBinding {
  readonly sent: SentMessage[] = [];

  async send(message: SentMessage): Promise<void> {
    this.sent.push(message);
  }
}

class FailingSendEmailBinding {
  async send(): Promise<void> {
    throw new Error('Email Service rejected the message');
  }
}

class FakeQueueMessage {
  outcome: 'pending' | 'acked' | 'retried' = 'pending';

  constructor(readonly body: SeatingJobQueueMessage) {}

  ack() {
    this.outcome = 'acked';
  }

  async retry() {
    this.outcome = 'retried';
  }
}

const job: JobRecord = {
  id: 'job-1',
  externalId: 'ext-job-1',
  userId: 'user-1',
  email: 'teacher@school.com',
  students: ['Alice', 'Bob'],
  seatingGrid: [
    [true, true],
    [true, true],
  ],
  conflicts: { Alice: [], Bob: [] },
  worksWellWithSoft: { Alice: ['Bob'], Bob: [] },
  worksWellWithStrong: {},
  maxResults: 1,
  algorithm: 'genetic',
  idempotencyKey: 'idem-1',
  status: 'completed',
  statusMetadata: null,
  resultsCount: 1,
  createdAt: 0,
  updatedAt: 0,
  emailSentAt: null,
  errorMessage: null,
} as JobRecord;

const results: SeatingResult[] = [
  {
    id: 1,
    jobId: 'job-1',
    arrangement: [
      ['Alice', null],
      [null, 'Bob'],
    ],
    fitnessScore: 0.95,
    arrangementHash: 'hash-1',
    createdAt: 0,
  },
];

const runQueue = async (binding: unknown) => {
  const message = new FakeQueueMessage({ jobId: job.id } as SeatingJobQueueMessage);
  const env = {
    EMAIL: binding,
    EMAIL_FROM_ADDRESS: 'results@example.test',
    EMAIL_FROM_NAME: 'Seating Results',
  } as unknown as EmailWorkerBindings;

  await worker.queue(
    { messages: [message] } as unknown as MessageBatch<SeatingJobQueueMessage>,
    env,
  );
  return message;
};

describe('email worker queue consumer', () => {
  beforeEach(() => {
    db.jobs.clear();
    db.results.clear();
    db.sentJobIds.length = 0;
    db.eligibility = 'eligible';
    db.jobs.set(job.id, job);
    db.results.set(job.id, results);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    return () => vi.restoreAllMocks();
  });

  it('sends the formatted results email from the configured sender, marks the job sent, and acks', async () => {
    const binding = new InMemorySendEmailBinding();

    const message = await runQueue(binding);

    const expected = buildEmailContent(job, results);
    expect(binding.sent).toHaveLength(1);
    const [sent] = binding.sent;
    expect(sent).toMatchObject({
      from: { email: 'results@example.test', name: 'Seating Results' },
      to: 'teacher@school.com',
      subject: expected.subject,
      text: expected.text,
    });
    // The HTML footer embeds the send time, so compare everything but that line.
    const stripTimestamp = (html: string) => html.replace(/Sent on [^<]*/, 'Sent on');
    expect(stripTimestamp(sent.html)).toBe(stripTimestamp(expected.html));
    expect(db.sentJobIds).toEqual([job.id]);
    expect(message.outcome).toBe('acked');
  });

  it('retries the message and leaves the job unsent when Email Service rejects the send', async () => {
    const message = await runQueue(new FailingSendEmailBinding());

    expect(db.sentJobIds).toEqual([]);
    expect(message.outcome).toBe('retried');
  });
});
