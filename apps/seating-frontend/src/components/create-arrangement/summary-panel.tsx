type SummaryPanelProps = {
  selectedSeatCount: number;
  gridCapacity: number;
  attendeeNames: string[];
};

export function SummaryPanel({
  selectedSeatCount,
  gridCapacity,
  attendeeNames,
}: SummaryPanelProps) {
  return (
    <div className="rounded-xl border border-dashed border-muted-foreground/40 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
      <p>
        Seats selected: <span className="font-semibold text-foreground">{selectedSeatCount}</span> /{' '}
        {gridCapacity}
      </p>
      <p>Names queued: {attendeeNames.length ? attendeeNames.join(', ') : 'None'}</p>
    </div>
  );
}
