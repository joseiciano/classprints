import { describe, expect, it } from 'vitest';
import { buildAlgorithmContext } from '../src/genetic-algorithm/algorithm';
import { calculateFitness } from '../src/genetic-algorithm/fitness';
import { SENTINEL_SEAT, STRICT_FITNESS_WEIGHTS } from '../src/genetic-algorithm/settings';
import type { Individual } from '../src/genetic-algorithm/types';
import type { JobRecord } from '../src/types';

const baseJob: JobRecord = {
  id: 'job-1',
  externalId: 'ext-job-1',
  email: 'teacher@school.com',
  students: ['Alice', 'Bob'],
  conflicts: {
    Alice: ['Bob'],
    Bob: ['Alice'],
  },
  worksWellWithSoft: {
    Alice: ['Bob'],
    Bob: [],
  },
  worksWellWithStrong: {},
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

describe('calculateFitness', () => {
  it('penalizes conflicting students sitting adjacent', () => {
    const context = buildAlgorithmContext(baseJob);
    const individual: Individual = new Uint16Array([0, 1]);
    const fitness = calculateFitness(individual, context, STRICT_FITNESS_WEIGHTS);
    expect(fitness).toBeLessThan(1);
  });

  it('rewards well-spaced students without conflicts', () => {
    const context = buildAlgorithmContext({
      ...baseJob,
      conflicts: { Alice: [], Bob: [] },
      worksWellWithSoft: { Alice: [], Bob: [] },
      worksWellWithStrong: {},
    });
    const individual: Individual = new Uint16Array([0, 3]);
    const fitness = calculateFitness(individual, context, STRICT_FITNESS_WEIGHTS);
    expect(fitness).toBeGreaterThan(0.8);
  });

  it('adds a bonus when works-well-with preferences are satisfied', () => {
    const jobWithThird = {
      ...baseJob,
      students: ['Alice', 'Bob', 'Charlie'],
      conflicts: { Alice: [], Bob: [], Charlie: [] },
      worksWellWithSoft: { Alice: ['Bob'], Bob: [], Charlie: [] },
      worksWellWithStrong: {},
    } satisfies JobRecord;
    const contextWithPrefs = buildAlgorithmContext(jobWithThird);
    const contextWithoutPrefs = buildAlgorithmContext({
      ...jobWithThird,
      worksWellWithSoft: { Alice: [], Bob: [], Charlie: [] },
      worksWellWithStrong: {},
    });
    const weights = { ...STRICT_FITNESS_WEIGHTS, invalidPenalty: 0.2 };
    const arrangement: Individual = new Uint16Array([0, 1, SENTINEL_SEAT]);
    const withBonus = calculateFitness(arrangement, contextWithPrefs, weights);
    const withoutBonus = calculateFitness(arrangement, contextWithoutPrefs, weights);
    expect(withBonus).toBeGreaterThan(withoutBonus);
  });

  it('penalizes unmet strong works-well preferences', () => {
    const context = buildAlgorithmContext({
      ...baseJob,
      students: ['Alice', 'Bob', 'Charlie', 'Diana'],
      conflicts: {},
      worksWellWithSoft: {},
      worksWellWithStrong: { Alice: ['Diana'] },
      seatingGrid: [[true, true, true, true]],
    });
    const adjacent: Individual = new Uint16Array([0, 1, 2, 1]); // Alice(0) Diana(1)
    const separated: Individual = new Uint16Array([0, 1, 2, 3]); // Alice(0) Diana(3)
    const weights = { ...STRICT_FITNESS_WEIGHTS, spacingBonusMax: 0, worksWellBonusMax: 0 };
    const satisfiedFitness = calculateFitness(adjacent, context, weights);
    const violatedFitness = calculateFitness(separated, context, weights);
    expect(satisfiedFitness).toBeGreaterThan(violatedFitness);
  });

  it('treats diagonal seats as grouped for strong preferences', () => {
    const context = buildAlgorithmContext({
      ...baseJob,
      conflicts: { Alice: [], Bob: [] },
      worksWellWithSoft: { Alice: [], Bob: [] },
      worksWellWithStrong: { Alice: ['Bob'], Bob: [] },
      seatingGrid: [
        [true, true],
        [true, true],
      ],
    });
    const diagonal: Individual = new Uint16Array([0, 3]);
    const weights = { ...STRICT_FITNESS_WEIGHTS, invalidPenalty: 0.2 };
    const fitness = calculateFitness(diagonal, context, weights);
    expect(fitness).toBeGreaterThan(0);
  });
});
