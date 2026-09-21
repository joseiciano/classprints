interface AttendeeInputSectionProps {
  names: string;
  attendeeNames: string[];
  nameValidationIssues: string[];
  onNamesChange: (value: string) => void;
}

export function AttendeeInputSection({
  names,
  attendeeNames,
  nameValidationIssues,
  onNamesChange,
}: AttendeeInputSectionProps) {
  return (
    <fieldset className="space-y-2">
      <div className="flex items-center justify-between">
        <label
          htmlFor="roster-names"
          className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground"
        >
          Roster
        </label>
        <span className="text-xs text-muted-foreground">
          {attendeeNames.length > 0 ? `${attendeeNames.length} listed` : 'None yet'}
        </span>
      </div>
      <textarea
        id="roster-names"
        value={names}
        onChange={(e) => onNamesChange(e.target.value)}
        rows={4}
        placeholder="Add a student, or paste a roster…"
        className="w-full resize-none rounded-lg border border-line bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {nameValidationIssues.length > 0 && (
        <p className="text-xs font-medium text-destructive">{nameValidationIssues[0]}</p>
      )}
      <p className="text-xs text-muted-foreground">Separate names with commas.</p>
    </fieldset>
  );
}
