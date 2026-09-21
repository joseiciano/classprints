interface StudentSelectorListProps {
  attendeeNames: string[];
  selectedStudentForContenders: string | null;
  conflictParseResult: { conflicts: Record<string, string[]> };
  worksWellParseResult: { worksWellWith: Record<string, string[]> };
  worksWellStrongParseResult: { worksWellWith: Record<string, string[]> };
  seatContenders: Record<string, [number, number][]>;
  onSelectStudent: (name: string | null) => void;
}

const BADGE_CLASS = 'font-mono text-[10px] uppercase tracking-[0.06em]';

export function StudentSelectorList({
  attendeeNames,
  selectedStudentForContenders,
  conflictParseResult,
  worksWellParseResult,
  worksWellStrongParseResult,
  seatContenders,
  onSelectStudent,
}: StudentSelectorListProps) {
  return (
    <div className="space-y-1">
      {attendeeNames.length === 0 ? (
        <p className="px-1 text-xs italic text-muted-foreground">
          Add names above to start configuring rules.
        </p>
      ) : (
        attendeeNames.map((name) => {
          const isSelected = selectedStudentForContenders === name;
          const hasConflicts = (conflictParseResult.conflicts[name]?.length ?? 0) > 0;
          const hasWorksWell =
            (worksWellParseResult.worksWellWith[name]?.length ?? 0) > 0 ||
            (worksWellStrongParseResult.worksWellWith[name]?.length ?? 0) > 0;
          const hasContenders = (seatContenders[name]?.length ?? 0) > 0;

          return (
            <button
              key={name}
              onClick={() => onSelectStudent(isSelected ? null : name)}
              aria-pressed={isSelected}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isSelected
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-foreground hover:bg-muted'
              }`}
            >
              <span className="truncate text-sm font-medium">{name}</span>
              <span className="ml-auto flex shrink-0 items-center gap-2">
                {hasConflicts && (
                  <span className={`${BADGE_CLASS} text-destructive`}>Conflicts</span>
                )}
                {hasWorksWell && <span className={`${BADGE_CLASS} text-primary`}>Partners</span>}
                {hasContenders && (
                  <span className={`${BADGE_CLASS} text-muted-foreground`}>
                    Seats {seatContenders[name].length}
                  </span>
                )}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}
