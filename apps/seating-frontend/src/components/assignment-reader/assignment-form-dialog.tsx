import { useEffect, useId, useState, type FormEvent } from 'react';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';

export interface AssignmentFormValues {
  name: string;
  maxScore: number | null;
}

export interface AssignmentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  initialValues?: AssignmentFormValues;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  onSubmit: (values: AssignmentFormValues) => void;
}

/**
 * The single assignment create/edit form (TASK-020's "assignment create/edit"
 * smart/view pair). `maxScore` omission and an empty field both mean "no
 * maximum", matching `CreateAssignmentBody`/`UpdateAssignmentBody`.
 */
export function AssignmentFormDialog({
  open,
  onOpenChange,
  mode,
  initialValues,
  isSubmitting = false,
  errorMessage,
  onSubmit,
}: AssignmentFormDialogProps) {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [maxScoreInput, setMaxScoreInput] = useState(
    initialValues?.maxScore != null ? String(initialValues.maxScore) : '',
  );
  const nameId = useId();
  const maxScoreId = useId();

  useEffect(() => {
    if (open) {
      setName(initialValues?.name ?? '');
      setMaxScoreInput(initialValues?.maxScore != null ? String(initialValues.maxScore) : '');
    }
  }, [open, initialValues?.name, initialValues?.maxScore]);

  const trimmedName = name.trim();
  const maxScoreValue = maxScoreInput.trim() === '' ? null : Number(maxScoreInput);
  const isMaxScoreValid =
    maxScoreValue === null || (Number.isFinite(maxScoreValue) && maxScoreValue >= 0);
  const isValid = trimmedName.length > 0 && trimmedName.length <= 200 && isMaxScoreValid;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!isValid || isSubmitting) return;
    onSubmit({
      name: trimmedName,
      maxScore: maxScoreValue === null ? null : Math.round(maxScoreValue * 100) / 100,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'create' ? 'New assignment' : 'Edit assignment'}
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
            <p className="mt-1.5 text-xs text-destructive">Enter a maximum score of 0 or more.</p>
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
