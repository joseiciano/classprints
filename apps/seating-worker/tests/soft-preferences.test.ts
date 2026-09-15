import { describe, expect, it } from 'vitest';
import { buildAlgorithmContext } from '../src/genetic-algorithm/algorithm';
import { calculateFitness } from '../src/genetic-algorithm/fitness';
import { STRICT_FITNESS_WEIGHTS } from '../src/genetic-algorithm/settings';
import type { Individual } from '../src/genetic-algorithm/types';
import type { JobRecord } from '../src/types';

describe('Soft Preferences Seating', () => {
  it('prefers seating students together over spacing them out when worksWellWithSoft is set', () => {
    const job: JobRecord = {
      id: 'job-soft-pref',
      externalId: 'ext-soft-pref',
      email: 'test@example.com',
      students: ['Alice', 'Bob'],
      conflicts: {},
      worksWellWithSoft: {
        Alice: ['Bob'],
        Bob: ['Alice'],
      },
      worksWellWithStrong: {},
      seatingGrid: Array(5).fill(Array(5).fill(true)),
      maxResults: 1,
      algorithm: 'genetic',
      idempotencyKey: 'soft-pref',
      status: 'pending',
      resultsCount: 0,
      statusMetadata: null,
      errorMessage: null,
      emailSentAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const context = buildAlgorithmContext(job);

    // Together (Adjacent)
    // Alice at (0,0) -> index 0
    // Bob at (0,1) -> index 1
    const together: Individual = new Uint16Array([0, 1]);
    const togetherFitness = calculateFitness(together, context, STRICT_FITNESS_WEIGHTS);

    // Far Apart (Corners)
    // Alice at (0,0) -> index 0
    // Bob at (4,4) -> index 24
    const apart: Individual = new Uint16Array([0, 24]);
    const apartFitness = calculateFitness(apart, context, STRICT_FITNESS_WEIGHTS);

    expect(togetherFitness).toBeGreaterThan(apartFitness);
  });
});
