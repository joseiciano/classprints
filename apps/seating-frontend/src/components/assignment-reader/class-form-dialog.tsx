import { useEffect, useId, useState, type FormEvent } from 'react';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';

export interface ClassFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'rename';
  initialName?: string;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  onSubmit: (name: string) => void;
}

const MAX_CLASS_NAME_LENGTH = 120;

/** The single class create/rename dialog, matching `CreateClassBody`/`UpdateClassBody`. */
export function ClassFormDialog({
  open,
  onOpenChange,
  mode,
  initialName = '',
  isSubmitting = false,
  errorMessage,
  onSubmit,
}: ClassFormDialogProps) {
  const [name, setName] = useState(initialName);
  const inputId = useId();

  useEffect(() => {
    if (open) {
      setName(initialName);
    }
  }, [open, initialName]);

  const trimmed = name.trim();
  const isValid = trimmed.length > 0 && trimmed.length <= MAX_CLASS_NAME_LENGTH;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!isValid || isSubmitting) return;
    onSubmit(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={mode === 'create' ? 'New class' : 'Rename class'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-foreground">
            Class name
          </label>
          <input
            id={inputId}
            type="text"
            autoFocus
            value={name}
            maxLength={MAX_CLASS_NAME_LENGTH}
            onChange={(event) => setName(event.target.value)}
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
            {isSubmitting ? 'Saving…' : mode === 'create' ? 'Create class' : 'Save'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
