import { useRef, useState } from 'react';
import type {
  DocumentAction,
  PageSummary,
  QuestionJudgmentValue,
  QuestionSegment,
  SubmissionRecord,
} from '@classprints/assignment-reader-shared';
import { isDecimal2 } from '@classprints/assignment-reader-shared';
import {
  useApplyQuestionPointsToScore,
  useMarkSubmissionGraded,
  useQuestionPointsTotal,
  useReturnToNeedsReview,
  useSubmissionPageWorkspaces,
  useUpdateAssignment,
  useUpdateGradingDraft,
  useUpdateQuestionJudgmentOnDocument,
} from '../../../hooks/use-assignment-reader';
import { formatScore } from '../../../lib/assignment-reader-format';
import { SeatingApiError } from '../../../lib/http';
import { AssignmentFormDialog } from '../assignment-form-dialog';
import { Button } from '../../ui/button';

const JUDGMENT_LABEL: Record<QuestionJudgmentValue, string> = {
  correct: 'Correct',
  incorrect: 'Incorrect',
  unmarked: 'Unmarked',
};

/**
 * TASK-026: one row per current parsed question segment across every
 * current, completed page, plus the submission-level grading rail. Materials
 * never render this panel — it is mounted only for a submission — and
 * readiness/grading-open state is read straight from the server's
 * `allowedActions`, never re-derived client-side, so the UI can never offer
 * an action the API would reject.
 */
export function GradingRail({
  classId,
  assignmentId,
  assignmentName,
  assignmentMaxScore,
  submission,
  pages,
  allowedActions,
}: {
  classId: string;
  assignmentId: string;
  assignmentName: string;
  assignmentMaxScore: number | null;
  submission: SubmissionRecord;
  pages: PageSummary[];
  allowedActions: DocumentAction[];
}) {
  const canEditGrading = allowedActions.includes('edit_grading');
  const canEditJudgments = allowedActions.includes('edit_question_judgments');
  const canMarkGraded = allowedActions.includes('mark_graded');
  const canReturn = allowedActions.includes('return_to_needs_review');

  return (
    <div className="space-y-6">
      <QuestionReviewPanel
        documentId={submission.id}
        pages={pages}
        canEdit={canEditJudgments}
      />
      <SubmissionGradingRail
        classId={classId}
        assignmentId={assignmentId}
        assignmentName={assignmentName}
        assignmentMaxScore={assignmentMaxScore}
        submission={submission}
        canEditGrading={canEditGrading}
        canMarkGraded={canMarkGraded}
        canReturn={canReturn}
      />
    </div>
  );
}

function QuestionReviewPanel({
  documentId,
  pages,
  canEdit,
}: {
  documentId: string;
  pages: PageSummary[];
  canEdit: boolean;
}) {
  const workspaces = useSubmissionPageWorkspaces(pages);
  const updateJudgment = useUpdateQuestionJudgmentOnDocument('submission', documentId);
  const [openCommentFor, setOpenCommentFor] = useState<string | null>(null);

  const rows = workspaces.data.flatMap(({ page, workspace }) =>
    (workspace?.questionSegments ?? []).map((segment) => ({ page, segment })),
  );

  return (
    <section className="space-y-4 rounded-[12px] border border-border bg-card p-5 shadow-card">
      <div>
        <h2 className="font-display text-xl font-medium text-foreground">Question review</h2>
        <p className="text-sm text-muted-foreground">Mark each parsed question with your own judgment.</p>
      </div>
      {workspaces.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading questions…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No parsed questions on this submission — use the submission score below.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ page, segment }, index) => (
            <QuestionRow
              key={segment.id}
              page={page}
              segment={segment}
              index={index}
              canEdit={canEdit}
              updateJudgment={updateJudgment}
              openCommentFor={openCommentFor}
              setOpenCommentFor={setOpenCommentFor}
            />
          ))}
        </ul>
      )}
      {updateJudgment.error instanceof SeatingApiError ? (
        <p role="alert" className="text-sm text-destructive">{updateJudgment.error.message}</p>
      ) : null}
    </section>
  );
}

function QuestionRow({
  page,
  segment,
  index,
  canEdit,
  updateJudgment,
  openCommentFor,
  setOpenCommentFor,
}: {
  page: Pick<PageSummary, 'id' | 'processingState' | 'position' | 'label' | 'pageRevision'>;
  segment: QuestionSegment;
  index: number;
  canEdit: boolean;
  updateJudgment: ReturnType<typeof useUpdateQuestionJudgmentOnDocument>;
  openCommentFor: string | null;
  setOpenCommentFor: (id: string | null) => void;
}) {
  const [judgmentValue, setJudgmentValue] = useState<QuestionJudgmentValue>(segment.judgment.judgment);
  const [pointsInput, setPointsInput] = useState(
    segment.judgment.awardedPoints !== null ? String(segment.judgment.awardedPoints) : '',
  );
  const [commentValue, setCommentValue] = useState(segment.judgment.comment ?? '');
  const awardedPointsBaselineRef = useRef(segment.judgment.awardedPoints);

  const trimmedPoints = pointsInput.trim();
  const parsedPoints = trimmedPoints === '' ? null : Number(trimmedPoints);
  const isPointsValid =
    parsedPoints === null || (Number.isFinite(parsedPoints) && parsedPoints >= 0 && isDecimal2(parsedPoints));

  // Every save path replaces the whole judgment record, so each one must send
  // the most recently known value for every field — the current local state —
  // rather than a snapshot captured once from props. Otherwise editing two of
  // these fields in quick succession (e.g. typing points, then clicking
  // Correct before the points mutation's response lands) sends a stale value
  // for whichever field wasn't just touched and silently reverts it.
  const commitJudgment = (next: {
    judgment?: QuestionJudgmentValue;
    awardedPoints?: number | null;
    comment?: string | null;
  }) => {
    const nextJudgment = next.judgment ?? judgmentValue;
    const nextAwardedPoints = 'awardedPoints' in next ? (next.awardedPoints ?? null) : parsedPoints;
    const nextComment = 'comment' in next ? (next.comment ?? null) : commentValue.trim() || null;

    setJudgmentValue(nextJudgment);
    setCommentValue(nextComment ?? '');
    awardedPointsBaselineRef.current = nextAwardedPoints;

    updateJudgment.mutate({
      pageId: page.id,
      segmentId: segment.id,
      body: {
        expectedPageRevision: page.pageRevision,
        judgment: nextJudgment,
        awardedPoints: nextAwardedPoints,
        comment: nextComment,
      },
    });
  };

  const savePoints = () => {
    if (!isPointsValid) return;
    if (parsedPoints === awardedPointsBaselineRef.current) return;
    commitJudgment({ awardedPoints: parsedPoints });
  };

  return (
    <li className="rounded-[10px] border border-border bg-background p-3.5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-muted px-1.5 font-mono text-xs font-semibold text-muted-foreground">
          Q{index + 1}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium text-foreground">
            {segment.questionText || segment.label || 'Parsed question'}
          </p>
          <p className="text-xs text-muted-foreground">
            {page.label}
            {segment.responseText ? ` · "${segment.responseText}"` : ''}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {(['correct', 'incorrect'] as const).map((value) => (
              <button
                key={value}
                type="button"
                disabled={!canEdit}
                onClick={() => commitJudgment({ judgment: value })}
                className={`inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  judgmentValue === value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-foreground hover:border-primary'
                }`}
              >
                {JUDGMENT_LABEL[value]}
              </button>
            ))}
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              Points
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                disabled={!canEdit}
                value={pointsInput}
                aria-label={`Awarded points for question ${index + 1}`}
                aria-invalid={!isPointsValid}
                onChange={(event) => setPointsInput(event.target.value)}
                onBlur={savePoints}
                className="h-8 w-16 rounded-full border border-border bg-card px-2 text-center text-xs text-foreground outline-none focus-visible:border-primary"
              />
            </label>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => setOpenCommentFor(openCommentFor === segment.id ? null : segment.id)}
              className="inline-flex min-h-8 items-center rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground hover:border-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              {commentValue ? 'Edit comment' : 'Add comment'}
            </button>
          </div>
          {!isPointsValid ? (
            <p className="text-xs text-destructive">Points must be 0 or more, with at most two decimals.</p>
          ) : null}
          {openCommentFor === segment.id ? (
            <textarea
              defaultValue={commentValue}
              disabled={!canEdit}
              maxLength={2000}
              rows={2}
              onBlur={(event) => commitJudgment({ comment: event.target.value.trim() || null })}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus-visible:border-primary"
              placeholder="Optional comment for this question"
            />
          ) : null}
        </div>
      </div>
    </li>
  );
}

function SubmissionGradingRail({
  classId,
  assignmentId,
  assignmentName,
  assignmentMaxScore,
  submission,
  canEditGrading,
  canMarkGraded,
  canReturn,
}: {
  classId: string;
  assignmentId: string;
  assignmentName: string;
  assignmentMaxScore: number | null;
  submission: SubmissionRecord;
  canEditGrading: boolean;
  canMarkGraded: boolean;
  canReturn: boolean;
}) {
  const [scoreInput, setScoreInput] = useState(submission.score !== null ? String(submission.score) : '');
  const [commentsInput, setCommentsInput] = useState(submission.comments ?? '');
  const [isEditMaxOpen, setIsEditMaxOpen] = useState(false);
  const [wantsPointsSum, setWantsPointsSum] = useState(false);

  const updateGradingDraft = useUpdateGradingDraft(submission.id);
  const markGraded = useMarkSubmissionGraded(submission.id);
  const returnToNeedsReview = useReturnToNeedsReview('submission', submission.id);
  const updateAssignment = useUpdateAssignment(assignmentId, classId);
  const pointsTotal = useQuestionPointsTotal(submission.id, submission.documentRevision, wantsPointsSum);
  const applyPoints = useApplyQuestionPointsToScore(submission.id);

  const trimmedScore = scoreInput.trim();
  const scoreValue = trimmedScore === '' ? null : Number(trimmedScore);
  const isScoreValid =
    scoreValue === null ||
    (Number.isFinite(scoreValue) &&
      scoreValue >= 0 &&
      isDecimal2(scoreValue) &&
      (assignmentMaxScore === null || scoreValue <= assignmentMaxScore));

  const saveGradingDraft = () => {
    if (!isScoreValid) return;
    updateGradingDraft.mutate({
      expectedDocumentRevision: submission.documentRevision,
      score: scoreValue,
      comments: commentsInput.trim() || null,
    });
  };

  return (
    <section className="space-y-4 rounded-[12px] border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-medium text-foreground">Grading rail</h2>
          <p className="text-sm text-muted-foreground">
            {submission.gradingState === 'graded' ? 'Graded' : canMarkGraded ? 'Ready to grade' : 'Not yet ready'}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="submission-score" className="text-sm font-medium text-foreground">
            Submission score <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              id="submission-score"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              disabled={!canEditGrading}
              value={scoreInput}
              onChange={(event) => setScoreInput(event.target.value)}
              onBlur={saveGradingDraft}
              placeholder="e.g. 8.5"
              className="min-h-10 w-28 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            />
            <span className="text-muted-foreground">/</span>
            <strong className="text-foreground">{assignmentMaxScore ?? '—'}</strong>
          </div>
          {!isScoreValid ? <p className="text-xs text-destructive">Score must be 0 or more, at most two decimals, and within the maximum.</p> : null}
          <button
            type="button"
            onClick={() => setIsEditMaxOpen(true)}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Edit assignment max score
          </button>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="submission-comments" className="text-sm font-medium text-foreground">
            Comments <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <textarea
            id="submission-comments"
            disabled={!canEditGrading}
            value={commentsInput}
            maxLength={4000}
            rows={3}
            onChange={(event) => setCommentsInput(event.target.value)}
            onBlur={saveGradingDraft}
            placeholder="Optional — overall feedback for this submission"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </div>
      </div>

      <div className="space-y-2 rounded-[10px] border border-border bg-background p-3.5">
        {!wantsPointsSum ? (
          <button
            type="button"
            disabled={!canEditGrading}
            onClick={() => setWantsPointsSum(true)}
            className="text-xs font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-40"
          >
            Use question-points sum…
          </button>
        ) : (
          <div className="space-y-2">
            {pointsTotal.isLoading ? (
              <p className="text-xs text-muted-foreground">Calculating question-points total…</p>
            ) : pointsTotal.data ? (
              <>
                <p className="text-sm text-foreground">
                  {pointsTotal.data.segmentsWithPoints} / {pointsTotal.data.totalSegments} questions scored ·
                  total <strong>{pointsTotal.data.total}</strong>
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={applyPoints.isPending}
                    onClick={() =>
                      applyPoints.mutate(
                        {
                          expectedDocumentRevision: submission.documentRevision,
                          expectedTotal: pointsTotal.data.total,
                          confirmed: true,
                        },
                        {
                          onSuccess: (result) => {
                            setScoreInput(result.score !== null ? String(result.score) : '');
                            setWantsPointsSum(false);
                          },
                        },
                      )
                    }
                  >
                    Use {pointsTotal.data.total} as score
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setWantsPointsSum(false)}>
                    Cancel
                  </Button>
                </div>
                {applyPoints.error instanceof SeatingApiError ? (
                  <p role="alert" className="text-xs text-destructive">{applyPoints.error.message}</p>
                ) : null}
              </>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={!canMarkGraded || markGraded.isPending}
          onClick={() => markGraded.mutate({ expectedDocumentRevision: submission.documentRevision })}
        >
          Mark graded
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!canReturn || returnToNeedsReview.isPending}
          onClick={() =>
            returnToNeedsReview.mutate({ expectedDocumentRevision: submission.documentRevision })
          }
        >
          Return to Needs review
        </Button>
        <span className="text-xs text-muted-foreground">
          Returning keeps draft score, comments, and question judgments for later revision.
        </span>
      </div>
      <p className="text-xs text-muted-foreground">Current score: {formatScore(submission.score, assignmentMaxScore)}</p>
      {updateGradingDraft.error instanceof SeatingApiError ? (
        <p role="alert" className="text-sm text-destructive">{updateGradingDraft.error.message}</p>
      ) : null}
      {markGraded.error instanceof SeatingApiError ? (
        <p role="alert" className="text-sm text-destructive">{markGraded.error.message}</p>
      ) : null}
      {returnToNeedsReview.error instanceof SeatingApiError ? (
        <p role="alert" className="text-sm text-destructive">{returnToNeedsReview.error.message}</p>
      ) : null}

      <AssignmentFormDialog
        open={isEditMaxOpen}
        onOpenChange={setIsEditMaxOpen}
        mode="rename"
        initialName={assignmentName}
        initialMaxScore={assignmentMaxScore}
        isSubmitting={updateAssignment.isPending}
        errorMessage={updateAssignment.error instanceof SeatingApiError ? updateAssignment.error.message : null}
        onSubmit={(values) => updateAssignment.mutate(values, { onSuccess: () => setIsEditMaxOpen(false) })}
      />
    </section>
  );
}
