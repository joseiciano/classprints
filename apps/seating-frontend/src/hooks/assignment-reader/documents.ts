import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ConfirmDocumentBody,
  DocumentRevisionCommandBody,
  DocumentType,
  RetranscribeDocumentBody,
} from '@classprints/assignment-reader-shared';
import {
  captureReviewContext,
  confirmDocument,
  deletePage,
  fetchAllDocumentPages,
  fetchAllDocumentProcessing,
  fetchDocumentAggregate,
  fetchDocumentWorkspace,
  markDocumentReady,
  recordAnalyticsEvent,
  retranscribeDocument,
  retryConfirmDocument,
  retryPage,
  returnToNeedsReview,
} from '../../lib/assignment-reader-api';
import { processingRefetchInterval } from '../use-processing-poll';
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
 * The complete current processing set (TASK-023's per-document page
 * detail): every current page, not one canonical-list page of it. Polls
 * every 3000 ms through `processingRefetchInterval`'s own rule — evaluated
 * as a function so it reacts to the response already on hand (visible and
 * not yet `completed`) without the caller needing that data first.
 */
export function useAllDocumentProcessing(
  documentType: DocumentType,
  documentId: string | undefined,
  visible: boolean,
) {
  return useQuery({
    queryKey: [...assignmentReaderKeys.documents.aggregate(documentType, documentId ?? ''), 'processing-all'],
    queryFn: () => fetchAllDocumentProcessing(documentType, documentId as string),
    enabled: Boolean(documentId),
    placeholderData: (previous) => previous,
    refetchInterval: (query) =>
      processingRefetchInterval(query.state.data, visible ? 'visible' : 'hidden'),
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

/** Re-enqueues undelivered revisions only (api-routes-documents.md §2.6). */
export function useRetryConfirmDocument(
  documentType: DocumentType,
  documentId: string,
  relatedKeys: readonly (readonly unknown[])[] = [],
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => retryConfirmDocument(documentType, documentId),
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

/**
 * Review-session start/end + materials-open instrumentation (TASK-027,
 * REQ-025). Fires `review_session_start` once per mounted document and
 * `review_session_end` (carrying the elapsed duration) once when the
 * workspace unmounts or switches to a different document; `recordOpen`
 * covers the one on-demand `materials_open` event. `recordAnalyticsEvent`
 * is itself best-effort, so nothing here needs its own error handling.
 */
export function useReviewSessionAnalytics(documentType: DocumentType, documentId: string | undefined) {
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!documentId) return;
    startedAtRef.current = Date.now();
    void recordAnalyticsEvent(documentType, documentId, { type: 'review_session_start' });
    return () => {
      const startedAt = startedAtRef.current;
      startedAtRef.current = null;
      if (startedAt === null) return;
      void recordAnalyticsEvent(documentType, documentId, {
        type: 'review_session_end',
        durationMs: Date.now() - startedAt,
      });
    };
  }, [documentType, documentId]);

  return {
    recordMaterialsOpen: () => {
      if (!documentId) return;
      void recordAnalyticsEvent(documentType, documentId, { type: 'materials_open' });
    },
  };
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
