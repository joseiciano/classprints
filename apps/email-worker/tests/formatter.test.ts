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

  describe('plain-text alternative', () => {
    const resultsOf = (count: number): SeatingResult[] =>
      Array.from({ length: count }, (_, index) => ({ ...results[0], id: index + 1 }));

    it.each([
      { name: 'no results', resultCount: 0, students: 2, expected: 'We generated 0 arrangements for your 2 students.' },
      { name: 'one result', resultCount: 1, students: 2, expected: 'We generated 1 arrangement for your 2 students.' },
      { name: 'many results', resultCount: 3, students: 5, expected: 'We generated 3 arrangements for your 5 students.' },
      { name: 'one student', resultCount: 1, students: 1, expected: 'We generated 1 arrangement for your 1 student.' },
    ])('states result and student counts in text and html ($name)', ({ resultCount, students, expected }) => {
      const content = buildEmailContent(
        { ...job, students: Array.from({ length: students }, (_, i) => `Student ${i}`) },
        resultsOf(resultCount),
      );

      expect(content.text).toContain('Your seating arrangements are ready.');
      expect(content.text).toContain(expected);
      expect(content.html).toContain(expected);
    });

    it('contains no HTML markup even when the HTML body renders tables and a summary', () => {
      const content = buildEmailContent(job, results);

      expect(content.html).toMatch(/<table/);
      expect(content.text).not.toMatch(/<\/?[a-z][^>]*>/i);
    });
  });
});
