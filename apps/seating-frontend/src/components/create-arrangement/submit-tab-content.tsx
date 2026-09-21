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

const STAT_LABEL_CLASS = 'font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground';

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
    <div className="mx-auto w-full max-w-xl space-y-5 rounded-[12px] border border-line bg-muted/40 p-6 text-center">
      <div className="space-y-1.5">
        <h2 className="font-display text-xl font-medium text-foreground">Ready to generate?</h2>
        <p className="text-sm text-muted-foreground">
          We&apos;ve gathered all your requirements. Review the summary and generate your seating
          charts.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-[12px] border border-line bg-card p-5 text-left">
        <div>
          <p className={STAT_LABEL_CLASS}>Attendees</p>
          <p className="text-lg font-semibold tabular-nums">{attendeeNames.length}</p>
        </div>
        <div>
          <p className={STAT_LABEL_CLASS}>Seats selected</p>
          <p className="text-lg font-semibold tabular-nums">{selectedSeatCount}</p>
        </div>
        {layoutMode !== 'random' && (
          <>
            <div className="col-span-2 mt-1 border-t border-line pt-3">
              <p className={STAT_LABEL_CLASS}>Method</p>
              <p className="text-sm font-semibold text-primary">
                {generationMethod === 'programmatic'
                  ? 'Algorithmic (genetic optimization)'
                  : 'AI assist (LLM)'}
              </p>
            </div>
            <div className="col-span-2 mt-1 border-t border-line pt-3">
              <p className={STAT_LABEL_CLASS}>Constraints</p>
              <div className="mt-1 flex gap-4 text-sm">
                <span>
                  Conflicts:{' '}
                  <strong className="tabular-nums">{conflictSummary.totalConflicts}</strong>
                </span>
                <span>
                  Partners:{' '}
                  <strong className="tabular-nums">
                    {worksWellSummary.totalPartners + worksWellStrongSummary.totalPartners}
                  </strong>
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="space-y-3">
        {submitError && <FormAlert tone="error">{submitError}</FormAlert>}

        {layoutMode === 'random' ? (
          <button
            type="button"
            className="w-full rounded-full bg-primary px-8 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onGenerateRandom}
            disabled={attendeeNames.length === 0 || selectedSeatCount === 0}
          >
            Generate random seating
          </button>
        ) : (
          <button
            type="button"
            onClick={onSubmit}
            className="w-full rounded-full bg-primary px-8 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitDisabled || isPending}
          >
            {isPending ? 'Generating…' : 'Generate chart'}
          </button>
        )}

        <button
          type="button"
          onClick={onBackToSettings}
          className="text-sm font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          ← Back to layout
        </button>
      </div>
    </div>
  );
}
