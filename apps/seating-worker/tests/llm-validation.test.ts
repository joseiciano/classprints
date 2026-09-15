import { describe, expect, it } from 'vitest';
import { validateArrangementWithDetails } from '../src/llm/seating-llm';
import type { SeatingJob } from '@classprints/seating-shared';

const baseJob: SeatingJob = {
  id: 'job-1',
  externalId: 'ext-job-1',
  email: 'teacher@school.com',
  students: ['Alice', 'Bob'],
  conflicts: {},
  worksWellWithSoft: {},
  worksWellWithStrong: {},
  seatContenders: {
    Alice: [[0, 0]],
  },
  seatingGrid: [
    [true, true],
    [true, true],
  ],
  maxResults: 1,
  algorithm: 'genetic',
  idempotencyKey: 'key',
  status: 'pending',
  resultsCount: 0,
  statusMetadata: null,
  errorMessage: null,
  emailSentAt: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

describe('LLM Arrangement Validation', () => {
  it('detects seat contender violations', () => {
    const arrangement = [
      [null, 'Alice'],
      ['Bob', null],
    ];
    const result = validateArrangementWithDetails(baseJob, arrangement);
    expect(result.errors).toContain(
      'Seat (0,1): "Alice" must be placed in one of the allowed seats: (0,0)',
    );
  });

  it('passes when seat contenders are respected', () => {
    const arrangement = [
      ['Alice', 'Bob'],
      [null, null],
    ];
    const result = validateArrangementWithDetails(baseJob, arrangement);
    expect(result.errors).toHaveLength(0);
  });
});
