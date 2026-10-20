import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SubmissionListQuery } from '@classprints/assignment-reader-shared';
import {
  createOrReturnSubmission,
  deleteSubmission,
  fetchSubmission,
  fetchSubmissions,
} from '../../lib/assignment-reader-api';
import { assignmentReaderKeys } from '../../lib/assignment-reader-query-keys';

export function useSubmissionsList(assignmentId: string, query: SubmissionListQuery) {
  return useQuery({
    queryKey: assignmentReaderKeys.assignments.submissions.list(assignmentId, query),
    queryFn: () => fetchSubmissions(assignmentId, query),
    placeholderData: (previous) => previous,
    // Submissions reflect background transcription progress; keep this list
    // fresh without the teacher needing to manually refresh the page.
    refetchInterval: 5000,
  });
}

export function useSubmission(submissionId: string | undefined) {
  return useQuery({
    queryKey: assignmentReaderKeys.submission.detail(submissionId ?? ''),
    queryFn: () => fetchSubmission(submissionId as string),
    enabled: Boolean(submissionId),
  });
}

/** Creates a student's submission, or returns their existing one (idempotent). */
export function useCreateOrReturnSubmission(assignmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (studentId: string) => createOrReturnSubmission(assignmentId, { studentId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: assignmentReaderKeys.assignments.submissions.all(assignmentId),
      });
      void queryClient.invalidateQueries({
        queryKey: assignmentReaderKeys.assignments.detail(assignmentId),
      });
    },
  });
}

export function useDeleteSubmission(submissionId: string, assignmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteSubmission(submissionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: assignmentReaderKeys.submission.detail(submissionId),
      });
      void queryClient.invalidateQueries({
        queryKey: assignmentReaderKeys.assignments.submissions.all(assignmentId),
      });
      void queryClient.invalidateQueries({
        queryKey: assignmentReaderKeys.assignments.detail(assignmentId),
      });
    },
  });
}
