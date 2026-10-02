import type { ReactNode } from 'react';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';

export interface ConfirmActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  tone?: 'default' | 'destructive';
  isSubmitting?: boolean;
  errorMessage?: string | null;
  onConfirm: () => void;
}

/**
 * Shared explicit-confirmation dialog for every destructive and non-trivial
 * mutation (archive, remove-from-roster, delete-*) called out across
 * TASK-020/021 so the wording and keyboard/focus behavior stay consistent.
 */
export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = 'default',
  isSubmitting = false,
  errorMessage,
  onConfirm,
}: ConfirmActionDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={tone === 'destructive' ? 'destructive' : 'primary'}
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Working…' : confirmLabel}
          </Button>
        </div>
      }
    >
      {errorMessage ? (
        <p role="alert" className="rounded-[10px] border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </Dialog>
  );
}
