import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ConfirmDocumentBody,
  DocumentRevisionCommandBody,
  DocumentType,
  ProcessingListQuery,
  RetranscribeDocumentBody,
} from '@classprints/assignment-reader-shared';
import {
  captureReviewContext,
  confirmDocument,
  deletePage,
  fetchAllDocumentPages,
  fetchDocumentAggregate,
  fetchDocumentProcessing,
  fetchDocumentWorkspace,
  markDocumentReady,
  retranscribeDocument,
  retryPage,
  returnToNeedsReview,
} from '../../lib/assignment-reader-api';
import { assignmentReaderKeys } from '../../lib/assignment-reader-query-keys';

export function useDocumentAggregate(documentType: DocumentType, documentId: string | undefined) {
  return useQuery({
    queryKey: assignmentReaderKeys.documents.aggregate(documentType, documentId ?? ''),
    queryFn: () => fetchDocumentAggregate(documentType, documentId as string),
    enabled: Boolean(documentId),
    // Backs the live processing/workspace placeholder pages; background
    // transcription can complete at any time.
    refetchInterval: 5000,
  });
}

/** The complete current page set for a document, ordered by position. */
export function useDocumentPages(documentType: DocumentType, documentId: string | undefined) {
  return useQuery({
    queryKey: [...assignmentReaderKeys.documents.aggregate(documentType, documentId ?? ''), 'pages'],
    queryFn: () => fetchAllDocumentPages(documentType, documentId as string),
    enabled: Boolean(documentId),
  });
}

/**
 * The canonical, sortable/searchable/paginated per-page processing list
 * (TASK-023). Polling is the caller's responsibility (`refetchIntervalMs`,
 * `false` to pause) so the "every 3000 ms, only while visible and any page
 * is non-terminal" rule lives with the component that knows both the page's
 * visibility and the document's current rollup, not buried in this hook.
 */
export function useDocumentProcessingList(
  documentType: DocumentType,
  documentId: string | undefined,
  query: ProcessingListQuery,
  refetchIntervalMs: number | false,
) {
  return useQuery({
    queryKey: assignmentReaderKeys.documents.processing(documentType, documentId ?? '', query),
    queryFn: () => fetchDocumentProcessing(documentType, documentId as string, query),
    enabled: Boolean(documentId),
    placeholderData: (previous) => previous,
    refetchInterval: refetchIntervalMs,
  });
}

function invalidateDocument(
  queryClient: ReturnType<typeof useQueryClient>,
  documentType: DocumentType,
  documentId: string,
  relatedKeys: readonly (readonly unknown[])[],
) {
  void queryClient.invalidateQueries({
    queryKey: assignmentReaderKeys.documents.aggregate(documentType, documentId),
  });
  for (const key of relatedKeys) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

/**
 * Deletes a current, unconfirmed page during the upload flow. `relatedKeys`
 * lets the caller also invalidate the owning assignment/submission branch
 * (e.g. so a submission's `pageCount` refreshes) without this shared hook
 * needing to know every possible caller's shape.
 */
export function useDeleteDocumentPage(
  documentType: DocumentType,
  documentId: string,
  relatedKeys: readonly (readonly unknown[])[] = [],
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pageId: string) => deletePage(pageId),
    onSuccess: () => invalidateDocument(queryClient, documentType, documentId, relatedKeys),
  });
}

export function useConfirmDocument(
  documentType: DocumentType,
  documentId: string,
  relatedKeys: readonly (readonly unknown[])[] = [],
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ConfirmDocumentBody) => confirmDocument(documentType, documentId, body),
    onSuccess: () => invalidateDocument(queryClient, documentType, documentId, relatedKeys),
  });
}

/**
 * The full workspace read (TASK-025): document identity, pages, and the
 * current review/grading rollup, driving every smart component on the
 * unified workspace route. Backed by a slower poll than the processing list
 * since background transcription state is read from `useDocumentPages`
 * instead; this still needs to notice another tab's review/grading commands.
 */
export function useDocumentWorkspace(documentType: DocumentType, documentId: string | undefined) {
  return useQuery({
    queryKey: assignmentReaderKeys.documents.workspace(documentType, documentId ?? ''),
    queryFn: () => fetchDocumentWorkspace(documentType, documentId as string),
    enabled: Boolean(documentId),
    refetchInterval: 10_000,
  });
}

function invalidateWorkspace(
  queryClient: ReturnType<typeof useQueryClient>,
  documentType: DocumentType,
  documentId: string,
  relatedKeys: readonly (readonly unknown[])[],
) {
  invalidateDocument(queryClient, documentType, documentId, relatedKeys);
  void queryClient.invalidateQueries({
    queryKey: assignmentReaderKeys.documents.workspace(documentType, documentId),
  });
}

/** Retries exactly the one failed page (REQ-013); never a document-wide action. */
export function useRetryPage(
  documentType: DocumentType,
  documentId: string,
  relatedKeys: readonly (readonly unknown[])[] = [],
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pageId: string) => retryPage(pageId),
    onSuccess: () => invalidateWorkspace(queryClient, documentType, documentId, relatedKeys),
  });
}

/** Whole-document retranscription (ALT-006); gated by explicit, separate consent. */
export function useRetranscribeDocument(
  documentType: DocumentType,
  documentId: string,
  relatedKeys: readonly (readonly unknown[])[] = [],
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RetranscribeDocumentBody) =>
      retranscribeDocument(documentType, documentId, body),
    onSuccess: () => invalidateWorkspace(queryClient, documentType, documentId, relatedKeys),
  });
}

export function useMarkDocumentReady(documentType: DocumentType, documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: DocumentRevisionCommandBody) =>
      markDocumentReady(documentType, documentId, body),
    onSuccess: () => invalidateWorkspace(queryClient, documentType, documentId, []),
  });
}

export function useReturnToNeedsReview(documentType: DocumentType, documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: DocumentRevisionCommandBody) =>
      returnToNeedsReview(documentType, documentId, body),
    onSuccess: () => invalidateWorkspace(queryClient, documentType, documentId, []),
  });
}

/** PAT-002: idempotent; safe to call every time a submission workspace mounts. */
export function useCaptureReviewContext(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => captureReviewContext(documentId),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: assignmentReaderKeys.documents.workspace('submission', documentId),
      }),
  });
}
