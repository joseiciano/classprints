interface StudentSelectorListProps {
  attendeeNames: string[];
  selectedStudentForContenders: string | null;
  conflictParseResult: { conflicts: Record<string, string[]> };
  worksWellParseResult: { worksWellWith: Record<string, string[]> };
  worksWellStrongParseResult: { worksWellWith: Record<string, string[]> };
  seatContenders: Record<string, [number, number][]>;
  onSelectStudent: (name: string | null) => void;
}

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
    <div className="space-y-4">
      <h2 className="text-xl font-semibold px-2">2. Configure Rules</h2>
      <div className="flex flex-col gap-1 max-h-[600px] overflow-y-auto pr-2">
        {attendeeNames.length === 0 ? (
          <p className="text-sm italic text-muted-foreground px-2">
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
                className={`flex flex-col items-start px-4 py-3 rounded-xl border transition text-left ${
                  isSelected
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'bg-card border-border hover:border-primary/50 text-foreground'
                }`}
              >
                <span className="font-medium">{name}</span>
                <div className="flex gap-2 mt-1">
                  {hasConflicts && (
                    <span
                      className={`text-[10px] uppercase font-bold ${
                        isSelected ? 'text-primary-foreground/80' : 'text-red-500'
                      }`}
                    >
                      Conflicts
                    </span>
                  )}
                  {hasWorksWell && (
                    <span
                      className={`text-[10px] uppercase font-bold ${
                        isSelected ? 'text-primary-foreground/80' : 'text-green-500'
                      }`}
                    >
                      Partners
                    </span>
                  )}
                  {hasContenders && (
                    <span
                      className={`text-[10px] uppercase font-bold ${
                        isSelected ? 'text-primary-foreground/80' : 'text-blue-500'
                      }`}
                    >
                      Seats {seatContenders[name].length}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
