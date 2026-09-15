import { FormAlert } from '../job-panels';

type RelationshipType = 'conflicts' | 'works-well' | 'works-well-strong';

interface RelationshipsPanelProps {
  selectedStudent: string;
  attendeeNames: string[];
  activeRelationshipType: RelationshipType;
  conflictParseResult: { conflicts: Record<string, string[]> };
  worksWellParseResult: { worksWellWith: Record<string, string[]> };
  worksWellStrongParseResult: { worksWellWith: Record<string, string[]> };
  conflictError: string | null;
  worksWellError: string | null;
  worksWellStrongError: string | null;
  conflictSummaryText: string;
  worksWellSummaryText: string;
  worksWellStrongSummaryText: string;
  onRelationshipTypeChange: (type: RelationshipType) => void;
  onToggleRelationship: (targetName: string) => void;
}

export function RelationshipsPanel({
  selectedStudent,
  attendeeNames,
  activeRelationshipType,
  conflictParseResult,
  worksWellParseResult,
  worksWellStrongParseResult,
  conflictError,
  worksWellError,
  worksWellStrongError,
  conflictSummaryText,
  worksWellSummaryText,
  worksWellStrongSummaryText,
  onRelationshipTypeChange,
  onToggleRelationship,
}: RelationshipsPanelProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-6 rounded-2xl border bg-card/80 p-8 shadow-card h-fit">
        <div className="flex flex-col gap-6">
          <nav className="flex gap-1 rounded-xl bg-muted/30 p-1 border border-border w-fit">
            {(['conflicts', 'works-well', 'works-well-strong'] as const).map((type) => (
              <button
                key={type}
                onClick={() => onRelationshipTypeChange(type)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
                  activeRelationshipType === type
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {type === 'conflicts'
                  ? 'Conflicts'
                  : type === 'works-well'
                    ? 'Works Well With'
                    : 'Work Well With Strong'}
              </button>
            ))}
          </nav>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">
                {activeRelationshipType === 'conflicts'
                  ? 'Conflicts'
                  : activeRelationshipType === 'works-well'
                    ? 'Works Well With'
                    : 'Work Well With Strong'}
              </label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {attendeeNames
                .filter((name) => name !== selectedStudent)
                .map((name) => {
                  const currentMap =
                    activeRelationshipType === 'conflicts'
                      ? conflictParseResult.conflicts
                      : activeRelationshipType === 'works-well'
                        ? worksWellParseResult.worksWellWith
                        : worksWellStrongParseResult.worksWellWith;

                  const isRelated =
                    currentMap[selectedStudent]?.includes(name) ||
                    currentMap[name]?.includes(selectedStudent);

                  return (
                    <button
                      key={name}
                      onClick={() => onToggleRelationship(name)}
                      className={`px-4 py-2 rounded-xl border transition text-sm font-medium text-center ${
                        isRelated
                          ? 'bg-primary/10 border-primary text-primary shadow-sm'
                          : 'bg-card border-border hover:border-primary/50 text-foreground'
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
            </div>

            {activeRelationshipType === 'conflicts' && conflictError && (
              <FormAlert tone="warning">{conflictError}</FormAlert>
            )}
            {activeRelationshipType === 'works-well' && worksWellError && (
              <FormAlert tone="warning">{worksWellError}</FormAlert>
            )}
            {activeRelationshipType === 'works-well-strong' && worksWellStrongError && (
              <FormAlert tone="warning">{worksWellStrongError}</FormAlert>
            )}

            <p className="text-xs text-muted-foreground">
              {activeRelationshipType === 'conflicts'
                ? conflictSummaryText
                : activeRelationshipType === 'works-well'
                  ? worksWellSummaryText
                  : worksWellStrongSummaryText}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
