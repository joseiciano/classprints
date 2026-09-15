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
    <div className="max-w-4xl mx-auto space-y-4 rounded-2xl border bg-card/80 p-6 shadow-card">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">1. Add Attendees</h2>
        <p className="text-sm text-muted-foreground">
          {attendeeNames.length > 0
            ? `${attendeeNames.length} attendee(s) listed.`
            : 'No attendees added yet.'}
        </p>
      </div>
      <textarea
        id="names"
        value={names}
        onChange={(e) => onNamesChange(e.target.value)}
        rows={3}
        placeholder="Alice, Bob, Charlie, Dee..."
        className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-base shadow-inner focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {nameValidationIssues.length > 0 && (
        <p className="text-sm text-red-500 font-medium">{nameValidationIssues[0]}</p>
      )}
      <p className="text-xs text-muted-foreground">Enter names separated by commas.</p>
    </div>
  );
}
