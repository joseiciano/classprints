import type { SeatingArrangement, SeatingGrid } from '@classprints/seating-shared';

const BLOCKED_LABEL = 'BLOCKED';
const EMPTY_LABEL = 'EMPTY';

/**
 * Recreates the original seating grid but replaces seats with the assigned student names
 * so logs mirror the incoming payload structure.
 */
export const buildArrangementGridLog = (
  seatingGrid: SeatingGrid,
  arrangement: SeatingArrangement,
): string[][] =>
  seatingGrid.map((row, rowIndex) =>
    row.map((isSeat, colIndex) => {
      if (!isSeat) return BLOCKED_LABEL;
      const occupant = arrangement[rowIndex]?.[colIndex];
      return occupant ?? EMPTY_LABEL;
    }),
  );
