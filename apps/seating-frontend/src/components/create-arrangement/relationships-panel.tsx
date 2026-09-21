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

const TYPE_LABELS: Record<RelationshipType, string> = {
  conflicts: 'Conflicts',
  'works-well': 'Works Well With',
  'works-well-strong': 'Work Well With Strong',
};

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
  const relationshipTypes: RelationshipType[] = ['conflicts', 'works-well', 'works-well-strong'];

  const activeError =
    activeRelationshipType === 'conflicts'
      ? conflictError
      : activeRelationshipType === 'works-well'
        ? worksWellError
        : worksWellStrongError;

  const activeSummaryText =
    activeRelationshipType === 'conflicts'
      ? conflictSummaryText
      : activeRelationshipType === 'works-well'
        ? worksWellSummaryText
        : worksWellStrongSummaryText;

  const currentMap =
    activeRelationshipType === 'conflicts'
      ? conflictParseResult.conflicts
      : activeRelationshipType === 'works-well'
        ? worksWellParseResult.worksWellWith
        : worksWellStrongParseResult.worksWellWith;

  return (
    <div className="space-y-4 rounded-[12px] border border-line bg-muted/40 p-5">
      <nav
        aria-label="Relationship type"
        className="inline-flex rounded-full border border-line bg-card p-1"
      >
        {relationshipTypes.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onRelationshipTypeChange(type)}
            aria-pressed={activeRelationshipType === type}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              activeRelationshipType === type
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {TYPE_LABELS[type]}
          </button>
        ))}
      </nav>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-foreground">
          {TYPE_LABELS[activeRelationshipType]}
        </label>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {attendeeNames
            .filter((name) => name !== selectedStudent)
            .map((name) => {
              const isRelated =
                currentMap[selectedStudent]?.includes(name) ||
                currentMap[name]?.includes(selectedStudent);

              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onToggleRelationship(name)}
                  aria-pressed={isRelated}
                  className={`rounded-lg border px-3 py-2 text-center text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isRelated
                      ? 'border-primary bg-secondary text-secondary-foreground'
                      : 'border-line bg-card text-foreground hover:border-primary/50'
                  }`}
                >
                  {name}
                </button>
              );
            })}
        </div>

        {activeError && <FormAlert tone="warning">{activeError}</FormAlert>}

        <p className="text-xs text-muted-foreground">{activeSummaryText}</p>
      </div>
    </div>
  );
}
