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
    <section className="space-y-4 rounded-2xl border bg-card/80 p-6 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Seat map</h2>
          <p className="text-sm text-muted-foreground">Click or drag to mark seatable spots.</p>
        </div>
        <button
          type="button"
          className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
          onClick={onClearGrid}
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
        Seats sync with the backend when you submit. Keep at least as many seats as attendees to
        avoid validation errors.
      </p>
    </section>
  );
}
