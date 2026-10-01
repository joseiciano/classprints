import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConfirmDocumentBody, DocumentType } from '@classprints/assignment-reader-shared';
import {
  confirmDocument,
  deletePage,
  fetchAllDocumentPages,
  fetchDocumentAggregate,
} from '../../lib/assignment-reader-api';
import { assignmentReaderKeys } from '../../lib/assignment-reader-query-keys';

export function useDocumentAggregate(documentType: DocumentType, documentId: string | undefined) {
  return useQuery({
    queryKey: assignmentReaderKeys.documents.aggregate(documentType, documentId ?? ''),
    queryFn: () => fetchDocumentAggregate(documentType, documentId as string),
    enabled: Boolean(documentId),
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
