import { describe, expect, it } from 'vitest';
import { buildEmailContent } from '../src/email/formatter';
import type { JobRecord, SeatingResult } from '../src/types';

const job: JobRecord = {
  id: 'job-1',
  externalId: 'ext-job-1',
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
  statusMetadata: {
    generationReached: 200,
    maxGenerations: 800,
    resultsDelivered: 1,
    resultsRequested: 1,
    completionReason: 'target_met',
  },
  resultsCount: 1,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  emailSentAt: null,
  errorMessage: null,
};

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
    createdAt: Date.now(),
  },
];

describe('buildEmailContent', () => {
  it('includes summary and arrangement table', () => {
    const content = buildEmailContent(job, results);
    expect(content.subject).toContain('Seating arrangements ready');
    expect(content.html).toContain('Run summary');
    expect(content.html).toContain('Alice');
  });

  it('renders fallback when no results available', () => {
    const content = buildEmailContent({ ...job, statusMetadata: null }, []);
    expect(content.html).toContain('No seating arrangements');
  });
});
