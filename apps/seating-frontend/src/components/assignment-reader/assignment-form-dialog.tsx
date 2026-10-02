import { useEffect, useId, useState, type FormEvent } from 'react';
import { isDecimal2 } from '@classprints/assignment-reader-shared';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';

export interface AssignmentFormValues {
  name: string;
  maxScore: number | null;
}

export interface AssignmentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'rename';
  initialName?: string;
  initialMaxScore?: number | null;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  onSubmit: (values: AssignmentFormValues) => void;
}

/**
 * The single assignment create/edit form (TASK-020's "assignment
 * create/edit" smart/view pair). An empty maximum-score field means "no
 * maximum" (`null`), matching `CreateAssignmentBody`/`UpdateAssignmentBody`;
 * a provided value must be a non-negative `Decimal2` (at most two decimal
 * places), exactly like the server's `decimal2Schema`.
 */
export function AssignmentFormDialog({
  open,
  onOpenChange,
  mode,
  initialName = '',
  initialMaxScore = null,
  isSubmitting = false,
  errorMessage,
  onSubmit,
}: AssignmentFormDialogProps) {
  const [name, setName] = useState(initialName);
  const [maxScoreInput, setMaxScoreInput] = useState(
    initialMaxScore != null ? String(initialMaxScore) : '',
  );
  const nameId = useId();
  const maxScoreId = useId();

  useEffect(() => {
    if (open) {
      setName(initialName);
      setMaxScoreInput(initialMaxScore != null ? String(initialMaxScore) : '');
    }
  }, [open, initialName, initialMaxScore]);

  const trimmedName = name.trim();
  const isNameValid = trimmedName.length > 0 && trimmedName.length <= 200;

  const trimmedMaxScore = maxScoreInput.trim();
  const maxScoreValue = trimmedMaxScore === '' ? null : Number(trimmedMaxScore);
  const isMaxScoreValid =
    maxScoreValue === null ||
    (Number.isFinite(maxScoreValue) && maxScoreValue >= 0 && isDecimal2(maxScoreValue));
  const isValid = isNameValid && isMaxScoreValid;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!isValid || isSubmitting) return;
    onSubmit({ name: trimmedName, maxScore: maxScoreValue });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'create' ? 'New assignment' : 'Rename assignment'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor={nameId} className="mb-1.5 block text-sm font-medium text-foreground">
            Assignment name
          </label>
          <input
            id={nameId}
            type="text"
            autoFocus
            value={name}
            maxLength={200}
            onChange={(event) => setName(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-border bg-background px-3.5 text-sm text-foreground outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </div>
        <div>
          <label htmlFor={maxScoreId} className="mb-1.5 block text-sm font-medium text-foreground">
            Maximum score <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            id={maxScoreId}
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={maxScoreInput}
            onChange={(event) => setMaxScoreInput(event.target.value)}
            placeholder="No maximum"
            className="min-h-11 w-full rounded-lg border border-border bg-background px-3.5 text-sm text-foreground outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
          />
          {!isMaxScoreValid ? (
            <p className="mt-1.5 text-xs text-destructive">
              Enter a maximum score of 0 or more, with at most two decimal places.
            </p>
          ) : null}
        </div>
        {errorMessage ? (
          <p
            role="alert"
            className="rounded-[10px] border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {errorMessage}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={!isValid || isSubmitting}>
            {isSubmitting ? 'Saving…' : mode === 'create' ? 'Create assignment' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
