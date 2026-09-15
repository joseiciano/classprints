import { calculateFitness } from './fitness';
import { produceNextGeneration } from './operators';
import type { EvaluatedIndividual } from './operators';
import { clonePopulation, individualToArrangement, initializePopulation } from './population';
import {
  FITNESS_IMPROVEMENT_EPSILON,
  MAX_GENERATIONS,
  MAX_PROCESSING_TIME_MS,
  POPULATION_SIZE,
  RESEED_GENERATION,
} from './settings';
import type {
  AlgorithmContext,
  AlgorithmOptions,
  AlgorithmResult,
  ArrangementCandidate,
  Population,
} from './types';
import type { JobRecord } from '../types';

export const runGeneticAlgorithm = (options: AlgorithmOptions): AlgorithmResult => {
  let population = options.state?.population
    ? clonePopulation(options.state.population)
    : initializePopulation(options.context);
  let generation = options.state?.generation ?? 0;
  let bestFitness = options.state?.bestFitness ?? 0;
  let reseeds = options.state?.reseeds ?? 0;
  let stagnantGenerations = options.state?.stagnantGenerations ?? 0;
  const maxTime = Math.min(options.maxProcessingTimeMs, MAX_PROCESSING_TIME_MS);
  const startTime = Date.now();
  const candidates: ArrangementCandidate[] = [];
  const seen = new Set<string>();
  let stagnationHit = false;

  while (Date.now() - startTime < maxTime && generation < MAX_GENERATIONS) {
    const evaluated = evaluatePopulation(population, options.context, options.fitnessWeights);
    if (evaluated.length === 0) break;

    const bestOfGeneration = evaluated[0].fitness;
    if (bestOfGeneration > bestFitness + FITNESS_IMPROVEMENT_EPSILON) {
      bestFitness = bestOfGeneration;
      stagnantGenerations = 0;
    } else {
      stagnantGenerations += 1;
    }

    collectCandidates(evaluated, options, candidates, seen, generation);
    if (candidates.length >= options.maxCandidates) break;

    if (options.stagnationLimit && stagnantGenerations >= options.stagnationLimit) {
      stagnationHit = true;
      break;
    }

    population = produceNextGeneration(evaluated, options.context);
    generation += 1;

    const noResultsYet = options.existingResults + candidates.length === 0;
    if (generation >= RESEED_GENERATION && noResultsYet && reseeds < 1) {
      population = initializePopulation(options.context, POPULATION_SIZE);
      reseeds += 1;
    }
  }

  return {
    population,
    generation,
    bestFitness,
    reseeds,
    stagnantGenerations,
    candidates,
    hitGenerationCap: generation >= MAX_GENERATIONS,
    stagnationHit,
  } satisfies AlgorithmResult;
};

const evaluatePopulation = (
  population: Population,
  context: AlgorithmContext,
  weights: AlgorithmOptions['fitnessWeights'],
): EvaluatedIndividual[] => {
  const evaluated: EvaluatedIndividual[] = population.map((individual) => ({
    individual,
    fitness: calculateFitness(individual, context, weights),
  }));
  evaluated.sort((a, b) => b.fitness - a.fitness);
  return evaluated;
};

const collectCandidates = (
  evaluated: EvaluatedIndividual[],
  options: AlgorithmOptions,
  candidates: ArrangementCandidate[],
  seen: Set<string>,
  generation: number,
) => {
  for (const entry of evaluated) {
    if (entry.fitness < options.fitnessThreshold) break;
    const arrangement = individualToArrangement(entry.individual, options.context);
    const key = arrangement.map((row) => row.map((value) => value ?? '-').join(',')).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ arrangement, fitnessScore: entry.fitness, generation });
    if (candidates.length >= options.maxCandidates) break;
  }
};

export const buildAlgorithmContext = (job: JobRecord): AlgorithmContext => {
  const seats: AlgorithmContext['seats'] = [];
  const adjacency = new Map<number, number[]>();
  const groupingAdjacency = new Map<number, number[]>();
  const seatMap = new Map<number, { index: number; row: number; col: number }>();
  let index = 0;
  job.seatingGrid.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (cell) {
        seats.push({ index, row: rowIndex, col: colIndex });
        seatMap.set(index, { index, row: rowIndex, col: colIndex });
        index += 1;
      }
    });
  });

  seats.forEach((seat) => {
    const neighbors: number[] = [];
    const groupingNeighbors: number[] = [];
    seats.forEach((other) => {
      if (seat.index === other.index) return;
      const rowDelta = Math.abs(seat.row - other.row);
      const colDelta = Math.abs(seat.col - other.col);
      const manhattanDistance = rowDelta + colDelta;
      if (manhattanDistance <= 1) {
        neighbors.push(other.index);
      }
      if (rowDelta <= 1 && colDelta <= 1) {
        groupingNeighbors.push(other.index);
      }
    });
    adjacency.set(seat.index, neighbors);
    groupingAdjacency.set(seat.index, groupingNeighbors);
  });

  const studentIndexMap = new Map<string, number>();
  job.students.forEach((student, idx) => studentIndexMap.set(student, idx));

  const seatContenders = new Map<number, Set<number>>();
  Object.entries(job.seatContenders ?? {}).forEach(([student, coordinates]) => {
    const studentIndex = studentIndexMap.get(student);
    if (studentIndex !== undefined) {
      const allowedSeats = new Set<number>();
      coordinates.forEach(([r, c]) => {
        const seat = seats.find((s) => s.row === r && s.col === c);
        if (seat) {
          allowedSeats.add(seat.index);
        }
      });
      if (allowedSeats.size > 0) {
        seatContenders.set(studentIndex, allowedSeats);
      }
    }
  });

  return {
    students: job.students,
    conflicts: job.conflicts,
    worksWellWithSoft: job.worksWellWithSoft,
    worksWellWithStrong: job.worksWellWithStrong,
    seatingGrid: job.seatingGrid,
    seats,
    adjacency,
    groupingAdjacency,
    maxResults: job.maxResults,
    studentIndexMap,
    seatMap,
    seatIndexes: seats.map((seat) => seat.index),
    seatContenders,
  } satisfies AlgorithmContext;
};
