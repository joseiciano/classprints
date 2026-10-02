import { useEffect, useId, useState, type FormEvent } from 'react';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';

export interface NameFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  initialValue?: string;
  maxLength: number;
  submitLabel: string;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  onSubmit: (name: string) => void;
}

/** Shared create/rename dialog for classes, students, and assignment names. */
export function NameFormDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  initialValue = '',
  maxLength,
  submitLabel,
  isSubmitting = false,
  errorMessage,
  onSubmit,
}: NameFormDialogProps) {
  const [value, setValue] = useState(initialValue);
  const inputId = useId();

  useEffect(() => {
    if (open) {
      setValue(initialValue);
    }
  }, [open, initialValue]);

  const trimmed = value.trim();
  const isValid = trimmed.length > 0 && trimmed.length <= maxLength;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!isValid || isSubmitting) return;
    onSubmit(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-foreground">
            {label}
          </label>
          <input
            id={inputId}
            type="text"
            autoFocus
            value={value}
            maxLength={maxLength}
            onChange={(event) => setValue(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-border bg-background px-3.5 text-sm text-foreground outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </div>
        {errorMessage ? (
          <p role="alert" className="rounded-[10px] border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={!isValid || isSubmitting}>
            {isSubmitting ? 'Saving…' : submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
