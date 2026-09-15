interface SeatContendersPanelProps {
  selectedStudent: string;
}

export function SeatContendersPanel({ selectedStudent }: SeatContendersPanelProps) {
  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Click seats on the map to restrict where <strong>{selectedStudent}</strong> can sit.
      </p>
    </div>
  );
}
