import {
  CROSSOVER_RATE,
  MUTATION_RATE,
  POPULATION_SIZE,
  SENTINEL_SEAT,
  TOURNAMENT_SIZE,
} from './settings';
import type { AlgorithmContext, Individual, Population } from './types';

export interface EvaluatedIndividual {
  individual: Individual;
  fitness: number;
}

export const produceNextGeneration = (
  evaluated: EvaluatedIndividual[],
  context: AlgorithmContext,
): Population => {
  const nextPopulation: Population = [];
  while (nextPopulation.length < POPULATION_SIZE) {
    const parentA = tournamentSelect(evaluated);
    const parentB = tournamentSelect(evaluated);
    let [childA, childB] = maybeCrossover(parentA, parentB);
    childA = maybeMutate(childA, context);
    childB = maybeMutate(childB, context);
    repairIndividual(childA, context);
    repairIndividual(childB, context);
    nextPopulation.push(childA, childB);
  }
  return nextPopulation.slice(0, POPULATION_SIZE);
};

const tournamentSelect = (evaluated: EvaluatedIndividual[]): EvaluatedIndividual => {
  const selection: EvaluatedIndividual[] = [];
  for (let i = 0; i < TOURNAMENT_SIZE; i += 1) {
    selection.push(evaluated[Math.floor(Math.random() * evaluated.length)]);
  }
  selection.sort((a, b) => b.fitness - a.fitness);
  return selection[0];
};

const maybeCrossover = (
  parentA: EvaluatedIndividual,
  parentB: EvaluatedIndividual,
): [Individual, Individual] => {
  if (Math.random() > CROSSOVER_RATE) {
    return [new Uint16Array(parentA.individual), new Uint16Array(parentB.individual)];
  }
  const pivot = Math.floor(Math.random() * parentA.individual.length);
  const childA = new Uint16Array(parentA.individual.length);
  const childB = new Uint16Array(parentA.individual.length);
  for (let i = 0; i < parentA.individual.length; i += 1) {
    if (i < pivot) {
      childA[i] = parentA.individual[i];
      childB[i] = parentB.individual[i];
    } else {
      childA[i] = parentB.individual[i];
      childB[i] = parentA.individual[i];
    }
  }
  return [childA, childB];
};

const maybeMutate = (individual: Individual, context: AlgorithmContext): Individual => {
  if (Math.random() > MUTATION_RATE) return individual;
  const mutated = new Uint16Array(individual);
  const indexA = Math.floor(Math.random() * mutated.length);
  const indexB = Math.floor(Math.random() * mutated.length);

  const seatA = mutated[indexA];
  const seatB = mutated[indexB];

  // Verify constraints for swap
  const allowedA = context.seatContenders.get(indexA);
  if (allowedA && seatB !== SENTINEL_SEAT && !allowedA.has(seatB)) {
    return individual;
  }
  const allowedB = context.seatContenders.get(indexB);
  if (allowedB && seatA !== SENTINEL_SEAT && !allowedB.has(seatA)) {
    return individual;
  }

  [mutated[indexA], mutated[indexB]] = [mutated[indexB], mutated[indexA]];

  // 10% chance to reseat a student randomly
  if (Math.random() < 0.1) {
    const allowed = context.seatContenders.get(indexA);
    let randomSeat: number;
    if (allowed) {
      const allowedArray = Array.from(allowed);
      randomSeat = allowedArray[Math.floor(Math.random() * allowedArray.length)];
    } else {
      randomSeat =
        context.seatIndexes[Math.floor(Math.random() * context.seatIndexes.length)] ??
        SENTINEL_SEAT;
    }
    mutated[indexA] = randomSeat;
  }
  return mutated;
};

const repairIndividual = (individual: Individual, context: AlgorithmContext) => {
  const used = new Set<number>();
  const invalidIndexes: number[] = [];

  for (let i = 0; i < individual.length; i += 1) {
    const seatIndex = individual[i];
    const allowed = context.seatContenders.get(i);

    if (
      seatIndex === SENTINEL_SEAT ||
      !context.seatMap.has(seatIndex) ||
      (allowed && !allowed.has(seatIndex))
    ) {
      invalidIndexes.push(i);
      continue;
    }

    if (used.has(seatIndex)) {
      invalidIndexes.push(i);
    } else {
      used.add(seatIndex);
    }
  }

  const availableSeats = context.seatIndexes.filter((seat) => !used.has(seat));

  // Sort invalid students with constraints by tightness
  const constrainedInvalid = invalidIndexes
    .filter((idx) => context.seatContenders.has(idx))
    .sort(
      (a, b) =>
        (context.seatContenders.get(a)?.size ?? 0) - (context.seatContenders.get(b)?.size ?? 0),
    );
  const unconstrainedInvalid = invalidIndexes.filter((idx) => !context.seatContenders.has(idx));

  for (const index of constrainedInvalid) {
    const allowed = context.seatContenders.get(index)!;
    const choices = availableSeats.filter((s) => allowed.has(s));
    if (choices.length > 0) {
      const chosenSeat = choices[0];
      individual[index] = chosenSeat;
      used.add(chosenSeat);
      const sIdx = availableSeats.indexOf(chosenSeat);
      if (sIdx > -1) availableSeats.splice(sIdx, 1);
    } else {
      individual[index] = SENTINEL_SEAT;
    }
  }

  let seatPointer = 0;
  for (const index of unconstrainedInvalid) {
    individual[index] = availableSeats[seatPointer] ?? SENTINEL_SEAT;
    seatPointer += 1;
  }
};
