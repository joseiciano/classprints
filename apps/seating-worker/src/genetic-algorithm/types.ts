import type { ConflictMap, SeatingGrid, WorksWellWithMap } from '../types';

export type Individual = Uint16Array;
export type Population = Individual[];

export interface SeatPosition {
  index: number;
  row: number;
  col: number;
}

export interface AlgorithmContext {
  students: string[];
  conflicts: ConflictMap;
  worksWellWithSoft: WorksWellWithMap;
  worksWellWithStrong: WorksWellWithMap;
  seatingGrid: SeatingGrid;
  seats: SeatPosition[];
  adjacency: Map<number, number[]>;
  groupingAdjacency: Map<number, number[]>;
  maxResults: number;
  studentIndexMap: Map<string, number>;
  seatMap: Map<number, SeatPosition>;
  seatIndexes: number[];
  seatContenders: Map<number, Set<number>>; // studentIndex -> Set of seatIndexes
}

export interface AlgorithmState {
  population: Population;
  generation: number;
  bestFitness: number;
  reseeds: number;
  stagnantGenerations: number;
}

export interface FitnessWeights {
  conflictPenalty: number;
  invalidPenalty: number;
  spacingBonusMax: number;
  worksWellBonusMax: number;
  worksWellStrongPenalty: number;
}

export interface ArrangementCandidate {
  arrangement: (string | null)[][];
  fitnessScore: number;
  generation: number;
}

export interface AlgorithmOptions {
  context: AlgorithmContext;
  state?: AlgorithmState | null;
  maxProcessingTimeMs: number;
  maxCandidates: number;
  existingResults: number;
  fitnessThreshold: number;
  fitnessWeights: FitnessWeights;
  stagnationLimit?: number;
}

export interface AlgorithmResult extends AlgorithmState {
  candidates: ArrangementCandidate[];
  hitGenerationCap: boolean;
  stagnationHit: boolean;
}
