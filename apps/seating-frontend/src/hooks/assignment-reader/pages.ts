import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DocumentType,
  ReviewPageBody,
  UpdatePageDraftBody,
  UpdateQuestionJudgmentBody,
} from '@classprints/assignment-reader-shared';
import {
  fetchPageWorkspace,
  reviewPage,
  updatePageDraft,
  updateQuestionJudgment,
} from '../../lib/assignment-reader-api';
import { assignmentReaderKeys } from '../../lib/assignment-reader-query-keys';

/**
 * One page's editable workspace (api-routes-review.md §1.2): the current
 * draft, question segments, and review timestamp backing the editor pane
 * (TASK-024/025). Only fetched for a `completed` page — callers gate on the
 * page summary's `processingState` before rendering the editor at all.
 */
export function usePageWorkspace(pageId: string | undefined) {
  return useQuery({
    queryKey: assignmentReaderKeys.pages.detail(pageId ?? ''),
    queryFn: () => fetchPageWorkspace(pageId as string),
    enabled: Boolean(pageId),
  });
}

function invalidatePage(
  queryClient: ReturnType<typeof useQueryClient>,
  pageId: string,
  documentType: DocumentType,
  documentId: string,
) {
  void queryClient.invalidateQueries({ queryKey: assignmentReaderKeys.pages.detail(pageId) });
  void queryClient.invalidateQueries({
    queryKey: assignmentReaderKeys.documents.workspace(documentType, documentId),
  });
  void queryClient.invalidateQueries({
    queryKey: [...assignmentReaderKeys.documents.aggregate(documentType, documentId), 'pages'],
  });
}

/**
 * Saves an edited draft (TASK-024's autosave). A `409 REVISION_CONFLICT`
 * surfaces through `mutation.error`/`mutation.isError` exactly like any
 * other mutation; the editor never auto-discards the local buffer on it —
 * only an explicit "Reload latest" action does, by refetching this page.
 */
export function useUpdatePageDraft(
  pageId: string,
  documentType: DocumentType,
  documentId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePageDraftBody) => updatePageDraft(pageId, body),
    onSuccess: (result) => {
      queryClient.setQueryData(assignmentReaderKeys.pages.detail(pageId), result);
      void queryClient.invalidateQueries({
        queryKey: assignmentReaderKeys.documents.workspace(documentType, documentId),
      });
    },
  });
}

export function useReviewPage(pageId: string, documentType: DocumentType, documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ReviewPageBody) => reviewPage(pageId, body),
    onSuccess: () => invalidatePage(queryClient, pageId, documentType, documentId),
  });
}

export function useUpdateQuestionJudgment(
  pageId: string,
  documentType: DocumentType,
  documentId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ segmentId, body }: { segmentId: string; body: UpdateQuestionJudgmentBody }) =>
      updateQuestionJudgment(pageId, segmentId, body),
    onSuccess: () => invalidatePage(queryClient, pageId, documentType, documentId),
  });
}
