import { useEffect, useId, useState } from 'react';
import { Check, Loader2, Search } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';
import { FormAlert } from './job-panels';
import { useActiveClasses, useSaveSeatingChartToClass } from '../hooks/use-save-to-class';
import { SeatingApiError } from '../lib/seating-api';

/**
 * Class selector and "Save to class" mutation (TASK-009). Copies the
 * currently selected seating result into a class-scoped snapshot. Saving
 * again for the same class replays the original snapshot rather than
 * creating a duplicate.
 */
export function SaveToClassButton({
  jobId,
  resultId,
  resultLabel,
}: {
  jobId: string;
  resultId: number | null;
  resultLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={resultId === null}
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-full bg-card"
      >
        Save to class
      </Button>
      {open ? (
        <SaveToClassDialog
          open={open}
          onOpenChange={setOpen}
          jobId={jobId}
          resultId={resultId}
          resultLabel={resultLabel}
        />
      ) : null}
    </>
  );
}

function SaveToClassDialog({
  open,
  onOpenChange,
  jobId,
  resultId,
  resultLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  resultId: number | null;
  resultLabel: string;
}) {
  const searchInputId = useId();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const { classes, isLoading: isLoadingClasses, error: listError } = useActiveClasses(debouncedQuery);
  const { saveToClass, isSaving, error: saveError, savedChart, reset } =
    useSaveSeatingChartToClass(jobId);

  const handleSave = async () => {
    if (!selectedClassId || resultId === null) return;
    await saveToClass({ classId: selectedClassId, resultId });
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      reset();
      setSelectedClassId(null);
      setQuery('');
    }
    onOpenChange(next);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Save to class"
      description={`Copy ${resultLabel} into one of your classes as a saved seating chart.`}
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
            {savedChart ? 'Done' : 'Cancel'}
          </Button>
          {!savedChart ? (
            <Button
              type="button"
              size="sm"
              disabled={!selectedClassId || isSaving || resultId === null}
              onClick={() => void handleSave()}
            >
              {isSaving ? (
                <>
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save chart'
              )}
            </Button>
          ) : null}
        </div>
      }
    >
      {savedChart ? (
        <FormAlert tone="info">
          <span className="flex items-center gap-2">
            <Check aria-hidden="true" className="h-4 w-4 shrink-0" />
            Saved to {savedChart.className}.
          </span>
        </FormAlert>
      ) : (
        <div className="space-y-4">
          {saveError ? (
            <FormAlert tone="error">
              {saveError instanceof SeatingApiError
                ? saveError.message
                : 'We could not save this chart. Please try again.'}
            </FormAlert>
          ) : null}

          <div>
            <label htmlFor={searchInputId} className="sr-only">
              Search classes
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                id={searchInputId}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search classes…"
                className="min-h-11 w-full rounded-full border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
          </div>

          {listError ? (
            <FormAlert tone="error">We could not load your classes. Please try again.</FormAlert>
          ) : null}

          <div
            role="radiogroup"
            aria-label="Select a class"
            className="max-h-64 space-y-1.5 overflow-y-auto"
          >
            {isLoadingClasses ? (
              <p className="px-1 py-2 text-sm text-muted-foreground">Loading classes…</p>
            ) : classes.length === 0 ? (
              <p className="px-1 py-2 text-sm text-muted-foreground">
                {query
                  ? 'No classes match your search.'
                  : 'You have not created any classes yet.'}
              </p>
            ) : (
              classes.map((schoolClass) => {
                const isSelected = schoolClass.id === selectedClassId;
                return (
                  <button
                    key={schoolClass.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setSelectedClassId(schoolClass.id)}
                    className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-[10px] border px-3.5 py-2.5 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      isSelected
                        ? 'border-primary bg-secondary text-secondary-foreground'
                        : 'border-border bg-card text-foreground hover:border-primary/50'
                    }`}
                  >
                    <span className="truncate">{schoolClass.name}</span>
                    <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                      {schoolClass.studentCount} student{schoolClass.studentCount === 1 ? '' : 's'}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
