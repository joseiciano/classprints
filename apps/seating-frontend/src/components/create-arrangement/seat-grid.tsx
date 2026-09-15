import { KeyboardEvent, PointerEvent } from 'react';
import type { SeatingGrid } from '@classprints/seating-shared';
import type { GridSize } from '../../lib/arrangement-utils';

type SeatGridProps = {
  seatGrid: SeatingGrid;
  gridSize: GridSize;
  isRandomView: boolean;
  randomAssignments: (string | null)[][];
  onSeatPointerDown: (
    rowIndex: number,
    colIndex: number,
  ) => (event: PointerEvent<HTMLButtonElement>) => void;
  onSeatPointerEnter: (
    rowIndex: number,
    colIndex: number,
  ) => (event: PointerEvent<HTMLButtonElement>) => void;
  onSeatKeyDown: (
    rowIndex: number,
    colIndex: number,
  ) => (event: KeyboardEvent<HTMLButtonElement>) => void;
  selectedStudentForContenders: string | null;
  seatContenders: Record<string, [number, number][]>;
};

export function SeatGrid({
  seatGrid,
  gridSize,
  isRandomView,
  randomAssignments,
  onSeatPointerDown,
  onSeatPointerEnter,
  onSeatKeyDown,
  selectedStudentForContenders,
  seatContenders,
}: SeatGridProps) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${gridSize.cols}, minmax(0, 1fr))` }}
      aria-label="Seating grid"
    >
      {seatGrid.map((row, rowIndex) =>
        row.map((isSeat, colIndex) => {
          const isAllowedForSelected =
            selectedStudentForContenders &&
            seatContenders[selectedStudentForContenders]?.some(
              ([r, c]) => r === rowIndex && c === colIndex,
            );

          return (
            <button
              key={`${rowIndex}-${colIndex}`}
              type="button"
              aria-pressed={isSeat}
              onPointerDown={onSeatPointerDown(rowIndex, colIndex)}
              onPointerEnter={onSeatPointerEnter(rowIndex, colIndex)}
              onKeyDown={onSeatKeyDown(rowIndex, colIndex)}
              className={`flex aspect-square items-center justify-center rounded-lg border text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                isAllowedForSelected
                  ? 'bg-yellow-400 text-yellow-950 border-yellow-500 shadow-md ring-2 ring-yellow-400/50 scale-105 z-10'
                  : isSeat
                    ? 'bg-primary text-primary-foreground border-primary shadow-card'
                    : 'bg-muted/40 text-muted-foreground hover:border-foreground/30'
              } ${selectedStudentForContenders && !isAllowedForSelected && isSeat ? 'opacity-60' : ''}`}
            >
              {isRandomView && randomAssignments[rowIndex]?.[colIndex]
                ? randomAssignments[rowIndex][colIndex]
                : `${rowIndex + 1}-${colIndex + 1}`}
            </button>
          );
        }),
      )}
    </div>
  );
}
