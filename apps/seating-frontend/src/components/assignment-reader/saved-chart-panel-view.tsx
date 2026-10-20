import type { SavedSeatingChart } from '@classprints/assignment-reader-shared';
import { formatDate } from '../../lib/assignment-reader-format';
import { Dialog } from '../ui/dialog';

export interface SavedChartPanelViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chart: SavedSeatingChart | null;
  loading: boolean;
  error: unknown;
}

/**
 * Pure read-only saved-chart viewer (opened from the Class Dashboard's
 * Seating Charts tab). Every seat — including an empty one — gets its own
 * accessible label, and the source seating job's external ID stays visible
 * so a teacher can trace the snapshot back to the chart it came from.
 */
export function SavedChartPanelView({ open, onOpenChange, chart, loading, error }: SavedChartPanelViewProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={chart ? `Seating chart · ${formatDate(chart.createdAt)}` : 'Seating chart'}
      description={chart ? `From chart ${chart.sourceJobExternalId} · ${chart.studentCount} students` : undefined}
    >
      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading seating chart…
        </p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          Unable to load this seating chart.
        </p>
      ) : chart ? (
        <SeatingGrid grid={chart.grid} />
      ) : null}
    </Dialog>
  );
}

function SeatingGrid({ grid }: { grid: Array<Array<string | null>> }) {
  const columnCount = Math.max(...grid.map((row) => row.length), 1);
  return (
    <div
      role="table"
      aria-label="Saved seating arrangement"
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
    >
      {grid.map((row, rowIndex) =>
        row.map((seat, columnIndex) => (
          <div
            key={`${rowIndex}-${columnIndex}`}
            role="cell"
            aria-label={`Row ${rowIndex + 1}, Seat ${columnIndex + 1}: ${seat ?? 'Empty seat'}`}
            className={`flex min-h-16 items-center justify-center rounded-lg border px-1.5 text-center text-xs font-medium ${
              seat ? 'border-primary/25 bg-secondary text-secondary-foreground' : 'border-dashed border-border text-muted-foreground'
            }`}
          >
            {seat ?? '—'}
          </div>
        )),
      )}
    </div>
  );
}
