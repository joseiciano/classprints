import {
  studentNameSchema,
  type RelationshipMap,
  type SeatingGrid,
} from '@classprints/seating-shared';

export type GridSize = {
  rows: number;
  cols: number;
};
export type ConflictParseResult = {
  conflicts: RelationshipMap;
  errors: string[];
};
export type WorksWellParseResult = {
  worksWellWith: RelationshipMap;
  errors: string[];
};
export type WorksWellStrongParseResult = {
  worksWellWith: RelationshipMap;
  errors: string[];
};
export type RelationshipParserOptions = {
  entryNoun: string;
};
export type RelationshipParseResult = {
  relationships: RelationshipMap;
  errors: string[];
};

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const createSeatGrid = (rows: number, cols: number): SeatingGrid =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));

export const createNameGrid = (rows: number, cols: number) =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => null as string | null));

export const resizeSeatGrid = (grid: SeatingGrid, rows: number, cols: number): SeatingGrid =>
  Array.from({ length: rows }, (_, rowIndex) =>
    Array.from({ length: cols }, (_, colIndex) => grid[rowIndex]?.[colIndex] ?? false),
  );

export const shuffleNames = (names: string[]) => {
  const next = [...names];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
};

export const parseRelationshipInput = (
  input: string,
  options: RelationshipParserOptions,
): RelationshipParseResult => {
  const relationships: RelationshipMap = {};
  const errors: string[] = [];
  const entryNounPlural = options.entryNoun.endsWith('s')
    ? options.entryNoun
    : `${options.entryNoun}s`;

  if (!input.trim()) {
    return { relationships, errors };
  }

  const normalized = input.replace(/;/g, '\n');
  normalized.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      errors.push(
        `Line ${index + 1} must follow "Name: ${options.entryNoun} 1, ${options.entryNoun} 2" format.`,
      );
      return;
    }

    const name = trimmed.slice(0, colonIndex).trim();
    const valueRaw = trimmed.slice(colonIndex + 1).trim();
    if (!name) {
      errors.push(`Line ${index + 1} is missing a name before the colon.`);
      return;
    }
    if (!valueRaw) {
      errors.push(`Line ${index + 1} requires at least one ${options.entryNoun} after the colon.`);
      return;
    }

    const values = valueRaw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (values.length === 0) {
      errors.push(`Line ${index + 1} requires comma-separated ${entryNounPlural} names.`);
      return;
    }

    const existing = relationships[name] ?? [];
    const uniqueValues = Array.from(new Set([...existing, ...values]));
    relationships[name] = uniqueValues;
  });

  return { relationships, errors };
};

export const parseConflictInput = (input: string): ConflictParseResult => {
  const { relationships, errors } = parseRelationshipInput(input, { entryNoun: 'conflict' });
  return { conflicts: relationships, errors };
};

export const parseWorksWellInput = (input: string): WorksWellParseResult => {
  const { relationships, errors } = parseRelationshipInput(input, { entryNoun: 'partner' });
  return { worksWellWith: relationships, errors };
};

export const parseStrongWorksWellInput = (input: string): WorksWellStrongParseResult => {
  const { relationships, errors } = parseRelationshipInput(input, { entryNoun: 'strong partner' });
  return { worksWellWith: relationships, errors };
};

export const summarizeRelationships = (map: RelationshipMap) => {
  const entries = Object.values(map);
  const participants = entries.filter((list) => list.length > 0).length;
  const total = entries.reduce((acc, list) => acc + list.length, 0);
  return { participants, total };
};

export const validateAttendeeName = (name: string): boolean => {
  const trimmed = name.trim();
  if (!trimmed) return true;
  return studentNameSchema.safeParse(trimmed).success;
};

export const validateRelationshipParticipants = (
  map: RelationshipMap,
  attendeeNames: string[],
  labels: { subject: string; value: string },
) => {
  if (attendeeNames.length === 0) return [] as string[];
  const attendeeSet = new Set(attendeeNames.map((name) => name.trim().toLowerCase()));
  const issues: string[] = [];

  Object.entries(map).forEach(([student, related]) => {
    const normalizedStudent = student.trim().toLowerCase();
    if (!attendeeSet.has(normalizedStudent)) {
      issues.push(`${labels.subject} "${student}" must be an attendee.`);
    }

    related.forEach((name) => {
      const normalizedName = name.trim().toLowerCase();
      if (!attendeeSet.has(normalizedName)) {
        issues.push(`${labels.value} "${name}" must match an attendee.`);
      }
    });
  });

  return issues;
};
