import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';

export interface RetranscribeConsentValues {
  confirmed: true;
  overwriteTeacherEdits: boolean;
  resetQuestionJudgments: boolean;
}

export interface RetranscribeConsentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageCount: number;
  /** Shows the teacher-edit overwrite consent only when it applies. */
  anyPageEditedByTeacher: boolean;
  /** Shows the question-judgment reset consent only for a submission. */
  documentType: 'materials' | 'submission';
  isSubmitting?: boolean;
  errorMessage?: string | null;
  onConfirm: (values: RetranscribeConsentValues) => void;
}

/**
 * Whole-document retranscription's explicit, separately-confirmed consent
 * (TASK-023/REQ-013/PAT-004): the base confirmation is always required: the
 * teacher-edit overwrite and question-judgment reset boxes only appear (and
 * only need checking) when they actually apply, but each is its own
 * checkbox — never bundled into one blanket "I agree".
 */
export function RetranscribeConsentDialog({
  open,
  onOpenChange,
  pageCount,
  anyPageEditedByTeacher,
  documentType,
  isSubmitting = false,
  errorMessage,
  onConfirm,
}: RetranscribeConsentDialogProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [resetJudgments, setResetJudgments] = useState(false);

  useEffect(() => {
    if (open) {
      setConfirmed(false);
      setOverwrite(false);
      setResetJudgments(false);
    }
  }, [open]);

  const needsOverwriteConsent = anyPageEditedByTeacher;
  const needsJudgmentConsent = documentType === 'submission';
  const canSubmit =
    confirmed && (!needsOverwriteConsent || overwrite) && (!needsJudgmentConsent || resetJudgments);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Retranscribe entire document"
      description={`All ${pageCount} current page${pageCount === 1 ? '' : 's'} will be re-sent for transcription. This cannot be undone and may re-bill the transcription provider.`}
    >
      <div className="space-y-3">
        <label className="flex items-start gap-2.5 text-sm text-foreground">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-primary"
          />
          I confirm retranscription of the current document revision, including its re-billing.
        </label>
        {needsOverwriteConsent ? (
          <label className="flex items-start gap-2.5 text-sm text-foreground">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(event) => setOverwrite(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-primary"
            />
            I understand teacher-edited pages will have their edits overwritten.
          </label>
        ) : null}
        {needsJudgmentConsent ? (
          <label className="flex items-start gap-2.5 text-sm text-foreground">
            <input
              type="checkbox"
              checked={resetJudgments}
              onChange={(event) => setResetJudgments(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-primary"
            />
            I understand current question judgments on this submission will reset.
          </label>
        ) : null}
        {errorMessage ? (
          <p role="alert" className="rounded-[10px] border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!canSubmit || isSubmitting}
            onClick={() =>
              onConfirm({
                confirmed: true,
                overwriteTeacherEdits: overwrite,
                resetQuestionJudgments: resetJudgments,
              })
            }
          >
            {isSubmitting ? 'Working…' : 'Retranscribe all pages'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
