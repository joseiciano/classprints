import { SENTINEL_SEAT } from './settings';
import type { AlgorithmContext, FitnessWeights, Individual } from './types';

export const calculateFitness = (
  individual: Individual,
  context: AlgorithmContext,
  weights: FitnessWeights,
): number => {
  // Hard constraint: Seat Contenders
  for (let i = 0; i < individual.length; i += 1) {
    const seatIndex = individual[i];
    const allowed = context.seatContenders.get(i);
    if (allowed && (seatIndex === SENTINEL_SEAT || !allowed.has(seatIndex))) {
      return 0.0;
    }
  }

  let score = 1.0;
  const conflictViolations = countConflictViolations(individual, context);
  score -= weights.conflictPenalty * conflictViolations;
  const invalidPlacements = countInvalidPlacements(individual, context);
  score -= weights.invalidPenalty * invalidPlacements;
  const strongViolations = countStrongPreferenceViolations(individual, context);
  score -= weights.worksWellStrongPenalty * strongViolations;
  score += calculateSpacingBonus(individual, context, weights.spacingBonusMax);
  score += calculateWorksWellBonus(individual, context, weights.worksWellBonusMax);
  return Math.max(0, score);
};

const countConflictViolations = (individual: Individual, context: AlgorithmContext): number => {
  let violations = 0;
  for (let i = 0; i < individual.length; i += 1) {
    const seatIndex = individual[i];
    if (seatIndex === SENTINEL_SEAT) continue;
    const adjacency = context.adjacency.get(seatIndex) ?? [];
    const student = context.students[i];
    const conflicts = context.conflicts[student] ?? [];
    for (const conflict of conflicts) {
      const conflictIndex = context.studentIndexMap.get(conflict);
      if (conflictIndex === undefined) continue;
      const conflictSeat = individual[conflictIndex];
      if (adjacency.includes(conflictSeat)) {
        violations += 1;
      }
    }
  }
  return violations;
};

const countInvalidPlacements = (individual: Individual, context: AlgorithmContext): number => {
  let invalid = 0;
  for (let i = 0; i < individual.length; i += 1) {
    if (individual[i] === SENTINEL_SEAT) {
      invalid += 1;
      continue;
    }
    if (!context.seatMap.has(individual[i])) {
      invalid += 1;
    }
  }
  return invalid;
};

const calculateSpacingBonus = (
  individual: Individual,
  context: AlgorithmContext,
  spacingBonusMax: number,
): number => {
  let totalDistance = 0;
  let comparisons = 0;
  for (let i = 0; i < individual.length; i += 1) {
    const posA = context.seatMap.get(individual[i]);
    if (!posA) continue;
    for (let j = i + 1; j < individual.length; j += 1) {
      const posB = context.seatMap.get(individual[j]);
      if (!posB) continue;
      const distance = Math.abs(posA.row - posB.row) + Math.abs(posA.col - posB.col);
      totalDistance += distance;
      comparisons += 1;
    }
  }
  if (comparisons === 0) return 0;
  const avgDistance = totalDistance / comparisons;
  const maxDistance = context.seatingGrid.length + (context.seatingGrid[0]?.length ?? 0);
  const normalized = Math.min(1, avgDistance / Math.max(1, maxDistance));
  return normalized * spacingBonusMax;
};

const calculateWorksWellBonus = (
  individual: Individual,
  context: AlgorithmContext,
  worksWellBonusMax: number,
): number => {
  if (!worksWellBonusMax) return 0;
  let satisfied = 0;
  let studentsWithPreferences = 0;

  for (let i = 0; i < individual.length; i += 1) {
    const student = context.students[i];
    const preferences = context.worksWellWithSoft[student];
    if (!preferences || preferences.length === 0) continue;

    studentsWithPreferences += 1;
    const seatIndex = individual[i];
    if (seatIndex === SENTINEL_SEAT) continue;
    const neighbors = context.groupingAdjacency.get(seatIndex) ?? [];

    for (const preferred of preferences) {
      const preferredIndex = context.studentIndexMap.get(preferred);
      if (preferredIndex === undefined) continue;
      const preferredSeat = individual[preferredIndex];
      if (preferredSeat === SENTINEL_SEAT) continue;
      if (neighbors.includes(preferredSeat)) {
        satisfied += 1;
        break;
      }
    }
  }

  if (studentsWithPreferences === 0) return 0;
  const normalized = satisfied / studentsWithPreferences;
  return normalized * worksWellBonusMax;
};

const countStrongPreferenceViolations = (
  individual: Individual,
  context: AlgorithmContext,
): number => {
  let violations = 0;
  for (let i = 0; i < individual.length; i += 1) {
    const seatIndex = individual[i];
    if (seatIndex === SENTINEL_SEAT) continue;
    const student = context.students[i];
    const preferences = context.worksWellWithStrong[student];
    if (!preferences || preferences.length === 0) continue;
    const neighbors = context.groupingAdjacency.get(seatIndex) ?? [];

    for (const preferred of preferences) {
      const preferredIndex = context.studentIndexMap.get(preferred);
      if (preferredIndex === undefined) continue;
      const preferredSeat = individual[preferredIndex];
      if (preferredSeat === SENTINEL_SEAT) {
        violations += 1;
        continue;
      }
      if (!neighbors.includes(preferredSeat)) {
        violations += 1;
      }
    }
  }
  return violations;
};
