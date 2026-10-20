import type {
  AssignmentStatus,
  ClassStatus,
  GradingState,
  ProcessingState,
  ReviewState,
  SubmissionListStatus,
} from '@classprints/assignment-reader-shared';

interface ChipDetails {
  label: string;
  className: string;
  animated?: boolean;
}

const baseChipClassName =
  'inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.08em]';

const neutral = 'border-border bg-muted text-muted-foreground';
const positive = 'border-primary/20 bg-secondary text-secondary-foreground';
const attention = 'border-accent bg-accent text-foreground';
const negative = 'border-destructive/30 bg-destructive/10 text-destructive';

function Chip({ label, className, animated }: ChipDetails) {
  return (
    <span aria-label={`Status: ${label}`} className={`${baseChipClassName} ${className}`}>
      {animated ? (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-pulse"
        />
      ) : null}
      {label}
    </span>
  );
}

export function ClassStatusChip({ status }: { status: ClassStatus }) {
  return status === 'archived' ? (
    <Chip label="Archived" className={neutral} />
  ) : (
    <Chip label="Active" className={positive} />
  );
}

export function AssignmentStatusChip({ status }: { status: AssignmentStatus }) {
  return status === 'graded' ? (
    <Chip label="Graded" className={positive} />
  ) : (
    <Chip label="Need review" className={attention} />
  );
}

const submissionStatusDetails: Record<SubmissionListStatus, ChipDetails> = {
  not_started: { label: 'Not started', className: neutral },
  uploading: { label: 'Uploading', className: attention, animated: true },
  queued: { label: 'Queued', className: attention, animated: true },
  transcribing: { label: 'Transcribing', className: attention, animated: true },
  error: { label: 'Error', className: negative },
  needs_review: { label: 'Needs review', className: attention },
  ready_to_grade: { label: 'Ready to grade', className: positive },
  graded: { label: 'Graded', className: positive },
};

export function SubmissionStatusChip({ status }: { status: SubmissionListStatus }) {
  return <Chip {...submissionStatusDetails[status]} />;
}

const processingStateDetails: Record<ProcessingState, ChipDetails> = {
  uploading: { label: 'Uploading', className: attention, animated: true },
  queued: { label: 'Queued', className: attention, animated: true },
  transcribing: { label: 'Transcribing', className: attention, animated: true },
  completed: { label: 'Completed', className: positive },
  failed: { label: 'Failed', className: negative },
};

export function ProcessingStateChip({ state }: { state: ProcessingState | null }) {
  if (!state) return <Chip label="Unconfirmed" className={neutral} />;
  return <Chip {...processingStateDetails[state]} />;
}

export function ReviewStateChip({ state }: { state: ReviewState | null }) {
  if (state === 'ready_to_grade') return <Chip label="Ready to grade" className={positive} />;
  if (state === 'needs_review') return <Chip label="Needs review" className={attention} />;
  return <Chip label="Processing" className={neutral} />;
}

export function GradingStateChip({ state }: { state: GradingState | null }) {
  if (state === 'graded') return <Chip label="Graded" className={positive} />;
  if (state === 'not_graded') return <Chip label="Not graded" className={neutral} />;
  return null;
}
