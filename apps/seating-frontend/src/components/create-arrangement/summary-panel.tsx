type SummaryPanelProps = {
  attendeeCount: number;
  selectedSeatCount: number;
  gridCapacity: number;
  rows: number;
  cols: number;
  conflicts: number;
  partners: number;
  strongPartners: number;
};

function SummaryLine({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-dashed border-line py-2 text-sm last:border-b-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`font-semibold tabular-nums ${valueClass ?? 'text-foreground'}`}>{value}</dd>
    </div>
  );
}

export function SummaryPanel({
  attendeeCount,
  selectedSeatCount,
  gridCapacity,
  rows,
  cols,
  conflicts,
  partners,
  strongPartners,
}: SummaryPanelProps) {
  return (
    <section aria-label="Summary" className="rounded-[12px] border border-line bg-card shadow-card">
      <header className="border-b border-line px-4 py-3">
        <h2 className="text-base font-semibold">Summary</h2>
      </header>
      <dl className="px-4 py-1">
        <SummaryLine label="Students" value={String(attendeeCount)} />
        <SummaryLine label="Seats selected" value={`${selectedSeatCount} / ${gridCapacity}`} />
        <SummaryLine label="Layout" value={`${rows} × ${cols}`} />
        <SummaryLine
          label="Conflict pairs"
          value={String(conflicts)}
          valueClass={conflicts > 0 ? 'text-destructive' : undefined}
        />
        <SummaryLine
          label="Works-well pairs"
          value={String(partners)}
          valueClass={partners > 0 ? 'text-primary' : undefined}
        />
        <SummaryLine
          label="Strong bonds"
          value={String(strongPartners)}
          valueClass={strongPartners > 0 ? 'text-primary' : undefined}
        />
      </dl>
    </section>
  );
}
