import type { FitnessWeights } from './types';

export const POPULATION_SIZE = 100;
export const MUTATION_RATE = 0.1;
export const CROSSOVER_RATE = 0.7;
export const TOURNAMENT_SIZE = 5;
export const MAX_PROCESSING_TIME_MS = 25_000;
export const MAX_GENERATIONS = 800;
export const RESEED_GENERATION = 400;
export const SENTINEL_SEAT = 0xffff;

export const STRICT_FITNESS_THRESHOLD = 0.9;
export const RELAXED_FITNESS_THRESHOLD = 0.75;
export const STRICT_CONFLICT_PENALTY = 0.2;
export const RELAXED_CONFLICT_PENALTY = 0.1;
export const INVALID_PLACEMENT_PENALTY = 0.5;
export const SPACING_BONUS_MAX = 0.05;
export const WORKS_WELL_BONUS_MAX = 0.2;
export const WORKS_WELL_STRONG_PENALTY = 0.4;
export const STAGNATION_GENERATION_LIMIT = 200;
export const FITNESS_IMPROVEMENT_EPSILON = 0.0001;

export const STRICT_FITNESS_WEIGHTS: FitnessWeights = {
  conflictPenalty: STRICT_CONFLICT_PENALTY,
  invalidPenalty: INVALID_PLACEMENT_PENALTY,
  spacingBonusMax: SPACING_BONUS_MAX,
  worksWellBonusMax: WORKS_WELL_BONUS_MAX,
  worksWellStrongPenalty: WORKS_WELL_STRONG_PENALTY,
};

export const RELAXED_FITNESS_WEIGHTS: FitnessWeights = {
  ...STRICT_FITNESS_WEIGHTS,
  conflictPenalty: RELAXED_CONFLICT_PENALTY,
};
