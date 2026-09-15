import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAlgorithmContext, runGeneticAlgorithm } from '../src/genetic-algorithm/algorithm';
import {
  STRICT_FITNESS_THRESHOLD,
  STRICT_FITNESS_WEIGHTS,
  STAGNATION_GENERATION_LIMIT,
} from '../src/genetic-algorithm/settings';
import type { JobRecord } from '../src/types';

const job: JobRecord = {
  id: 'job-1',
  externalId: 'ext-job-1',
  email: 'teacher@school.com',
  students: ['Alice', 'Bob', 'Charlie'],
  conflicts: {
    Alice: [],
    Bob: [],
    Charlie: [],
  },
  worksWellWithSoft: {
    Alice: ['Bob'],
    Bob: [],
    Charlie: [],
  },
  worksWellWithStrong: {},
  seatingGrid: [
    [true, true],
    [true, true],
  ],
  maxResults: 2,
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

const randomValues = [0.1, 0.4, 0.7, 0.9];
let randomIndex = 0;
const originalRandom = Math.random;

describe('runGeneticAlgorithm', () => {
  beforeEach(() => {
    randomIndex = 0;
    Math.random = () => {
      const value = randomValues[randomIndex % randomValues.length];
      randomIndex += 1;
      return value;
    };
  });

  afterEach(() => {
    Math.random = originalRandom;
  });

  it('finds candidate arrangements for simple job', () => {
    const context = buildAlgorithmContext(job);
    const result = runGeneticAlgorithm({
      context,
      maxProcessingTimeMs: 50,
      maxCandidates: 2,
      existingResults: 0,
      fitnessThreshold: STRICT_FITNESS_THRESHOLD,
      fitnessWeights: STRICT_FITNESS_WEIGHTS,
      stagnationLimit: STAGNATION_GENERATION_LIMIT,
    });

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.generation).toBeGreaterThanOrEqual(0);
  });

  it('continues generations when state provided', () => {
    const context = buildAlgorithmContext(job);
    const first = runGeneticAlgorithm({
      context,
      maxProcessingTimeMs: 10,
      maxCandidates: 1,
      existingResults: 0,
      fitnessThreshold: STRICT_FITNESS_THRESHOLD,
      fitnessWeights: STRICT_FITNESS_WEIGHTS,
      stagnationLimit: STAGNATION_GENERATION_LIMIT,
    });
    const second = runGeneticAlgorithm({
      context,
      state: first,
      maxProcessingTimeMs: 10,
      maxCandidates: 1,
      existingResults: 0,
      fitnessThreshold: STRICT_FITNESS_THRESHOLD,
      fitnessWeights: STRICT_FITNESS_WEIGHTS,
      stagnationLimit: STAGNATION_GENERATION_LIMIT,
    });
    expect(second.generation).toBeGreaterThanOrEqual(first.generation);
  });
});
