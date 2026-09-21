interface SeatContendersPanelProps {
  selectedStudent: string;
}

export function SeatContendersPanel({ selectedStudent }: SeatContendersPanelProps) {
  return (
    <p className="text-sm text-muted-foreground">
      Click seats on the map above to restrict where{' '}
      <strong className="text-foreground">{selectedStudent}</strong> can sit.
    </p>
  );
}
