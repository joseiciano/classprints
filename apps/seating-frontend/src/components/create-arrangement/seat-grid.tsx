import { Fragment, KeyboardEvent, PointerEvent } from 'react';
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

const SEAT_LABEL_CLASS =
  'flex h-10 items-center justify-center font-mono text-[10px] text-muted-foreground';

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
    <div className="overflow-x-auto pb-1">
      <div
        className="grid w-max gap-1.5"
        style={{ gridTemplateColumns: `1.5rem repeat(${gridSize.cols}, 2.75rem)` }}
        aria-label="Seating grid"
      >
        <span aria-hidden="true" />
        {Array.from({ length: gridSize.cols }, (_, colIndex) => (
          <span key={`col-${colIndex}`} aria-hidden="true" className={SEAT_LABEL_CLASS}>
            {colIndex + 1}
          </span>
        ))}
        {seatGrid.map((row, rowIndex) => (
          <Fragment key={`row-${rowIndex}`}>
            <span aria-hidden="true" className={SEAT_LABEL_CLASS}>
              {rowIndex + 1}
            </span>
            {row.map((isSeat, colIndex) => {
              const assignedName = isRandomView
                ? randomAssignments[rowIndex]?.[colIndex] ?? null
                : null;
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
                  aria-label={
                    assignedName
                      ? `Seat ${rowIndex + 1}-${colIndex + 1}: ${assignedName}`
                      : `Row ${rowIndex + 1}, seat ${colIndex + 1}`
                  }
                  onPointerDown={onSeatPointerDown(rowIndex, colIndex)}
                  onPointerEnter={onSeatPointerEnter(rowIndex, colIndex)}
                  onKeyDown={onSeatKeyDown(rowIndex, colIndex)}
                  className={`flex h-10 items-center justify-center overflow-hidden rounded-lg border px-0.5 text-[10px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
                    isAllowedForSelected
                      ? 'z-10 border-accent bg-accent text-accent-foreground ring-2 ring-accent ring-offset-2 ring-offset-card'
                      : isSeat
                        ? selectedStudentForContenders
                          ? 'border-primary bg-primary text-primary-foreground opacity-60'
                          : 'border-primary bg-primary text-primary-foreground'
                        : 'border-dashed border-line hover:border-primary'
                  }`}
                >
                  {assignedName && (
                    <span className="line-clamp-2 leading-tight">{assignedName}</span>
                  )}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
