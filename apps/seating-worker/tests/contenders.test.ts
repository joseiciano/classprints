import { describe, expect, it } from 'vitest';
import { buildAlgorithmContext } from '../src/genetic-algorithm/algorithm';
import { calculateFitness } from '../src/genetic-algorithm/fitness';
import { initializePopulation } from '../src/genetic-algorithm/population';
import { STRICT_FITNESS_WEIGHTS } from '../src/genetic-algorithm/settings';
import type { Individual } from '../src/genetic-algorithm/types';
import type { JobRecord } from '../src/types';

const baseJob: JobRecord = {
  id: 'job-1',
  externalId: 'ext-job-1',
  email: 'teacher@school.com',
  students: ['Alice', 'Bob', 'Charlie'],
  conflicts: {},
  worksWellWithSoft: {},
  worksWellWithStrong: {},
  seatContenders: {},
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

describe('Seat Contenders', () => {
  describe('Fitness Enforcement', () => {
    it('returns 0 fitness if a student is not in their allowed seats', () => {
      const jobWithContenders = {
        ...baseJob,
        seatContenders: {
          Alice: [[0, 0]], // Alice MUST be at (0,0)
        },
      };
      const context = buildAlgorithmContext(jobWithContenders);

      // Alice at (0,0) -> seat index 0
      const validIndividual: Individual = new Uint16Array([0, 1, 2]);
      const validFitness = calculateFitness(validIndividual, context, STRICT_FITNESS_WEIGHTS);
      expect(validFitness).toBeGreaterThan(0);

      // Alice at (0,1) -> seat index 1
      const invalidIndividual: Individual = new Uint16Array([1, 0, 2]);
      const invalidFitness = calculateFitness(invalidIndividual, context, STRICT_FITNESS_WEIGHTS);
      expect(invalidFitness).toBe(0);
    });

    it('returns 0 fitness if a student is missing from the grid but has contenders', () => {
      const jobWithContenders = {
        ...baseJob,
        seatContenders: {
          Alice: [[0, 0]],
        },
      };
      const context = buildAlgorithmContext(jobWithContenders);
      const individual: Individual = new Uint16Array([65535, 1, 2]); // Alice is SENTINEL
      const fitness = calculateFitness(individual, context, STRICT_FITNESS_WEIGHTS);
      expect(fitness).toBe(0);
    });
  });

  describe('Population Initialization', () => {
    it('ensures all individuals in the initial population respect contenders', () => {
      const jobWithStrictContenders = {
        ...baseJob,
        seatContenders: {
          Alice: [[0, 0]],
          Bob: [[0, 1]],
        },
      };
      const context = buildAlgorithmContext(jobWithStrictContenders);
      const population = initializePopulation(context, 10);

      for (const individual of population) {
        // Alice (index 0) must be at seat 0
        expect(individual[0]).toBe(0);
        // Bob (index 1) must be at seat 1
        expect(individual[1]).toBe(1);

        const fitness = calculateFitness(individual, context, STRICT_FITNESS_WEIGHTS);
        expect(fitness).toBeGreaterThan(0);
      }
    });

    it('handles overlapping contenders during initialization', () => {
      const jobWithOverlapping = {
        ...baseJob,
        students: ['Alice', 'Bob'],
        seatContenders: {
          Alice: [
            [0, 0],
            [0, 1],
          ],
          Bob: [[0, 0]],
        },
        seatingGrid: [[true, true]],
      };
      const context = buildAlgorithmContext(jobWithOverlapping);
      const population = initializePopulation(context, 20);

      for (const individual of population) {
        expect(individual[1]).toBe(0); // Bob MUST be at 0
        expect(individual[0]).toBe(1); // Alice MUST be at 1 because Bob took 0

        const fitness = calculateFitness(individual, context, STRICT_FITNESS_WEIGHTS);
        expect(fitness).toBeGreaterThan(0);
      }
    });
  });
});
