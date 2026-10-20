import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApplyQuestionPointsBody,
  DocumentRevisionCommandBody,
  UpdateGradingDraftBody,
} from '@classprints/assignment-reader-shared';
import {
  applyQuestionPointsToScore,
  getQuestionPointsTotal,
  markSubmissionGraded,
  updateGradingDraft,
} from '../../lib/assignment-reader-api';
import { assignmentReaderKeys } from '../../lib/assignment-reader-query-keys';

function invalidateGrading(queryClient: ReturnType<typeof useQueryClient>, submissionId: string) {
  void queryClient.invalidateQueries({ queryKey: assignmentReaderKeys.submission.detail(submissionId) });
  void queryClient.invalidateQueries({
    queryKey: assignmentReaderKeys.documents.workspace('submission', submissionId),
  });
}

/** PATCH /submissions/:submissionId/grading (api-routes-review.md §2.2): score/comments draft only. */
export function useUpdateGradingDraft(submissionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateGradingDraftBody) => updateGradingDraft(submissionId, body),
    onSuccess: () => invalidateGrading(queryClient, submissionId),
  });
}

/**
 * The question-points sum preview (api-routes-review.md §2.3): read on
 * demand, never automatically applied, so the teacher sees the exact total
 * before explicitly confirming it as the score.
 */
export function useQuestionPointsTotal(
  submissionId: string,
  expectedDocumentRevision: number | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: assignmentReaderKeys.questionPointsTotal(submissionId, expectedDocumentRevision ?? 0),
    queryFn: () =>
      getQuestionPointsTotal(submissionId, {
        expectedDocumentRevision: expectedDocumentRevision as number,
      }),
    enabled: enabled && expectedDocumentRevision !== undefined,
  });
}

export function useApplyQuestionPointsToScore(submissionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ApplyQuestionPointsBody) => applyQuestionPointsToScore(submissionId, body),
    onSuccess: () => invalidateGrading(queryClient, submissionId),
  });
}

export function useMarkSubmissionGraded(submissionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: DocumentRevisionCommandBody) => markSubmissionGraded(submissionId, body),
    onSuccess: () => invalidateGrading(queryClient, submissionId),
  });
}
