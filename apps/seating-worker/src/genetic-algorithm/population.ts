import { POPULATION_SIZE, SENTINEL_SEAT } from './settings';
import type { AlgorithmContext, Individual, Population } from './types';

export const initializePopulation = (
  context: AlgorithmContext,
  size = POPULATION_SIZE,
): Population => {
  const population: Population = [];

  for (let i = 0; i < size; i += 1) {
    population.push(createValidIndividual(context));
  }

  return population;
};

const createValidIndividual = (context: AlgorithmContext): Individual => {
  const individual = new Uint16Array(context.students.length).fill(SENTINEL_SEAT);
  const availableSeats = new Set(context.seatIndexes);

  // Students with contenders first (sorted by number of allowed seats, ascending, to handle tight constraints first)
  const constrainedStudents = Array.from(context.seatContenders.keys()).sort(
    (a, b) =>
      (context.seatContenders.get(a)?.size ?? 0) - (context.seatContenders.get(b)?.size ?? 0),
  );

  const assignedStudents = new Set<number>();

  for (const studentIndex of constrainedStudents) {
    const allowed = context.seatContenders.get(studentIndex)!;
    const choices = Array.from(allowed).filter((s) => availableSeats.has(s));

    if (choices.length > 0) {
      const chosenSeat = choices[Math.floor(Math.random() * choices.length)];
      individual[studentIndex] = chosenSeat;
      availableSeats.delete(chosenSeat);
      assignedStudents.add(studentIndex);
    }
  }

  // Fill remaining students
  const remainingStudents = context.students
    .map((_, idx) => idx)
    .filter((idx) => !assignedStudents.has(idx));

  const shuffledSeats = shuffle(Array.from(availableSeats));

  for (let i = 0; i < remainingStudents.length; i++) {
    const studentIndex = remainingStudents[i];
    individual[studentIndex] = shuffledSeats[i] ?? SENTINEL_SEAT;
  }

  return individual;
};

export const clonePopulation = (population: Population): Population =>
  population.map((individual) => new Uint16Array(individual));

export const individualToArrangement = (
  individual: Individual,
  context: AlgorithmContext,
): (string | null)[][] => {
  const arrangement: (string | null)[][] = context.seatingGrid.map((row) =>
    row.map((): null => null),
  );
  for (let i = 0; i < individual.length; i += 1) {
    const seatIndex = individual[i];
    const student = context.students[i];
    const position = context.seatMap.get(seatIndex);
    if (position) {
      arrangement[position.row][position.col] = student;
    }
  }

  return arrangement;
};

const shuffle = (input: number[]): number[] => {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};
