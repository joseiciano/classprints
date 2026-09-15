import { FormAlert } from '../job-panels';

type GenerationMethod = 'programmatic' | 'ai';

interface SubmitTabContentProps {
  layoutMode: 'custom' | 'random';
  generationMethod: GenerationMethod;
  attendeeNames: string[];
  selectedSeatCount: number;
  conflictSummary: { totalConflicts: number };
  worksWellSummary: { totalPartners: number };
  worksWellStrongSummary: { totalPartners: number };
  submitError: string | null;
  isPending: boolean;
  onSubmit: () => void;
  onGenerateRandom: () => void;
  onBackToSettings: () => void;
  isSubmitDisabled: boolean;
}

export function SubmitTabContent({
  layoutMode,
  generationMethod,
  attendeeNames,
  selectedSeatCount,
  conflictSummary,
  worksWellSummary,
  worksWellStrongSummary,
  submitError,
  isPending,
  onSubmit,
  onGenerateRandom,
  onBackToSettings,
  isSubmitDisabled,
}: SubmitTabContentProps) {
  return (
    <div className="max-w-xl mx-auto space-y-8 rounded-3xl border bg-card/80 p-10 shadow-card text-center">
      <div className="space-y-4">
        <h2 className="text-3xl font-bold">Ready to generate?</h2>
        <p className="text-muted-foreground">
          We&apos;ve gathered all your requirements. Review the summary below and click submit to
          start the seating process.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 text-left p-6 rounded-2xl bg-muted/30 border border-border">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
            Attendees
          </p>
          <p className="text-lg font-semibold">{attendeeNames.length}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
            Seats Selected
          </p>
          <p className="text-lg font-semibold">{selectedSeatCount}</p>
        </div>
        {layoutMode !== 'random' && (
          <>
            <div className="col-span-2 border-t border-border pt-4 mt-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
                Method
              </p>
              <p className="text-sm font-semibold text-primary">
                {generationMethod === 'programmatic'
                  ? 'Programmatic (Genetic Algorithm)'
                  : 'AI Powered (LLM)'}
              </p>
            </div>
            <div className="col-span-2 border-t border-border pt-4 mt-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">
                Constraints
              </p>
              <div className="flex gap-4 mt-1">
                <span className="text-sm">
                  Conflicts: <strong>{conflictSummary.totalConflicts}</strong>
                </span>
                <span className="text-sm">
                  Partners:{' '}
                  <strong>
                    {worksWellSummary.totalPartners + worksWellStrongSummary.totalPartners}
                  </strong>
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="space-y-4">
        {submitError && <FormAlert tone="error">{submitError}</FormAlert>}

        {layoutMode === 'random' ? (
          <button
            type="button"
            className="w-full rounded-full bg-primary px-8 py-4 text-lg font-bold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
            onClick={onGenerateRandom}
            disabled={attendeeNames.length === 0 || selectedSeatCount === 0}
          >
            Generate Random Seating
          </button>
        ) : (
          <button
            onClick={onSubmit}
            className="w-full rounded-full bg-primary px-8 py-4 text-lg font-bold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitDisabled || isPending}
          >
            {isPending ? 'Processing…' : 'Send to seating worker'}
          </button>
        )}

        <button
          onClick={onBackToSettings}
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition"
        >
          ← Back to settings
        </button>
      </div>
    </div>
  );
}
