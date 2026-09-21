import { KeyboardEvent, PointerEvent } from 'react';
import type { SeatingGrid } from '@classprints/seating-shared';
import type { GridSize } from '../../lib/arrangement-utils';
import { SeatGrid } from './seat-grid';

type SeatMapPanelProps = {
  seatGrid: SeatingGrid;
  gridSize: GridSize;
  isRandomView: boolean;
  randomAssignments: (string | null)[][];
  onClearGrid: () => void;
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

export function SeatMapPanel({
  seatGrid,
  gridSize,
  isRandomView,
  randomAssignments,
  onClearGrid,
  onSeatPointerDown,
  onSeatPointerEnter,
  onSeatKeyDown,
  selectedStudentForContenders,
  seatContenders,
}: SeatMapPanelProps) {
  return (
    <section aria-label="Seat map" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Seat map</h2>
          <p className="text-xs text-muted-foreground">Click or drag to mark seatable spots.</p>
        </div>
        <button
          type="button"
          onClick={onClearGrid}
          className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Clear grid
        </button>
      </div>

      <SeatGrid
        seatGrid={seatGrid}
        gridSize={gridSize}
        isRandomView={isRandomView}
        randomAssignments={randomAssignments}
        onSeatPointerDown={onSeatPointerDown}
        onSeatPointerEnter={onSeatPointerEnter}
        onSeatKeyDown={onSeatKeyDown}
        selectedStudentForContenders={selectedStudentForContenders}
        seatContenders={seatContenders}
      />

      <p className="text-xs text-muted-foreground">
        Wide maps scroll horizontally. Keep at least as many seats as attendees to avoid validation
        errors.
      </p>
    </section>
  );
}
