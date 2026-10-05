import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import type { DocumentType, PageSummary } from '@classprints/assignment-reader-shared';
import {
  deletePage,
  replacePageImage,
  uploadDocumentPage,
} from '../../lib/assignment-reader-api';
import {
  useConfirmDocument,
  useDocumentPages,
} from '../../hooks/use-assignment-reader';
import {
  createConcurrencyLimiter,
  MAX_DOCUMENT_PAGES,
  UPLOAD_CONCURRENCY,
  validateUploadFile,
  validateUploadSelection,
} from '../../hooks/use-upload-flow';
import { assignmentReaderKeys } from '../../lib/assignment-reader-query-keys';
import { SeatingApiError } from '../../lib/http';
import { defaultSubmissionsSearch } from '../../lib/assignment-reader-search';
import { UploadFlowView, type UploadFlowItem } from './upload-flow-view';

interface QueueItem {
  id: string;
  file: File | null;
  pageId: string | null;
  fileName: string;
  status: 'queued' | 'uploading' | 'uploaded' | 'failed';
  errorMessage?: string;
  isExisting: boolean;
}

let localIdCounter = 0;
const nextLocalId = () => `local-${(localIdCounter += 1)}`;

function messageFor(error: unknown): string {
  return error instanceof SeatingApiError ? error.message : 'Upload failed. Try again.';
}

/**
 * The single shared ordered upload flow (TASK-022): used for both material
 * and submission documents. Each file is its own independent one-page
 * upload request — never a presigned URL or one giant request — uploaded
 * with bounded concurrency 3 via a `createConcurrencyLimiter` instance held
 * for the lifetime of this document's upload flow, so every upload and
 * replace started across separate `addFiles`/`handleReplace` calls shares
 * one document-wide ceiling rather than each call racing its own pool.
 * Client-side checks (`validateUploadFile`/`validateUploadSelection`) are UX
 * only; the server remains the source of truth and its validation is
 * surfaced per row.
 */
export function UploadFlow({
  documentType,
  documentId,
  classId,
  assignmentId,
}: {
  documentType: DocumentType;
  documentId: string;
  classId: string;
  assignmentId: string;
}) {
  const navigate = useNavigate();
  const existingPages = useDocumentPages(documentType, documentId);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const itemsRef = useRef<QueueItem[]>([]);
  itemsRef.current = items;
  // One limiter per mounted document: shared by every `runUploads` and
  // `handleReplace` call so the document-wide in-flight upload count never
  // exceeds `UPLOAD_CONCURRENCY`, even across separate file selections.
  const concurrencyLimiterRef = useRef(createConcurrencyLimiter(UPLOAD_CONCURRENCY));

  const relatedKeys = [
    assignmentReaderKeys.assignments.detail(assignmentId),
    documentType === 'materials'
      ? assignmentReaderKeys.assignments.materialVersions.all(assignmentId)
      : assignmentReaderKeys.assignments.submissions.all(assignmentId),
  ];
  const confirmDocument = useConfirmDocument(documentType, documentId, relatedKeys);

  // Hydrate from the document's existing current pages exactly once, so
  // resuming an interrupted upload (or editing a draft already holding
  // pages) shows them in their persisted order.
  useEffect(() => {
    if (hasHydrated || !existingPages.data) return;
    setItems(
      existingPages.data.map((page: PageSummary) => ({
        id: page.id,
        file: null,
        pageId: page.id,
        fileName: page.label,
        status: 'uploaded' as const,
        isExisting: true,
      })),
    );
    setHasHydrated(true);
  }, [existingPages.data, hasHydrated]);

  const updateItem = (id: string, patch: Partial<QueueItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeItemLocally = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const addFiles = (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    let occupiedCount = itemsRef.current.length;
    const toUpload: QueueItem[] = [];
    const rejected: QueueItem[] = [];
    let lastLimitMessage: string | null = null;

    for (const file of incoming) {
      const limitMessage = validateUploadSelection(file, occupiedCount);
      if (limitMessage) {
        lastLimitMessage = limitMessage;
        continue;
      }
      const fileMessage = validateUploadFile(file);
      const row: QueueItem = {
        id: nextLocalId(),
        file,
        pageId: null,
        fileName: file.name,
        status: fileMessage ? 'failed' : 'queued',
        errorMessage: fileMessage ?? undefined,
        isExisting: false,
      };
      occupiedCount += 1;
      if (fileMessage) {
        rejected.push(row);
      } else {
        toUpload.push(row);
      }
    }

    setBannerMessage(lastLimitMessage);
    const newRows = [...rejected, ...toUpload];
    if (newRows.length > 0) {
      setItems((current) => [...current, ...newRows]);
    }
    if (toUpload.length > 0) {
      runUploads(toUpload);
    }
  };

  const runUploads = (rows: QueueItem[]) => {
    for (const row of rows) {
      void concurrencyLimiterRef.current
        .run(() => {
          updateItem(row.id, { status: 'uploading', errorMessage: undefined });
          return uploadDocumentPage(documentType, documentId, row.file as File);
        })
        .then((page) => {
          updateItem(row.id, { pageId: page.id, status: 'uploaded', fileName: page.label });
        })
        .catch((error) => {
          updateItem(row.id, { status: 'failed', errorMessage: messageFor(error) });
        });
    }
  };

  const handleReplace = (itemId: string, file: File) => {
    const fileMessage = validateUploadFile(file);
    if (fileMessage) {
      updateItem(itemId, { errorMessage: fileMessage });
      return;
    }
    const item = itemsRef.current.find((candidate) => candidate.id === itemId);
    if (!item) return;

    if (!item.pageId) {
      // Never made it to the server; just re-queue with the new file.
      const row: QueueItem = { ...item, file, fileName: file.name, status: 'queued', errorMessage: undefined };
      updateItem(itemId, row);
      runUploads([row]);
      return;
    }

    const pageId = item.pageId;
    void concurrencyLimiterRef.current
      .run(() => {
        updateItem(itemId, { status: 'uploading', errorMessage: undefined });
        return replacePageImage(pageId, file);
      })
      .then((result) => {
        updateItem(itemId, {
          id: result.page.id,
          pageId: result.page.id,
          file,
          fileName: result.page.label,
          status: 'uploaded',
        });
      })
      .catch((error) => {
        updateItem(itemId, { status: 'failed', errorMessage: messageFor(error) });
      });
  };

  const handleRemove = (itemId: string) => {
    const item = itemsRef.current.find((candidate) => candidate.id === itemId);
    if (!item) return;
    if (item.pageId) {
      deletePage(item.pageId).catch(() => {
        // The page is already gone from the current set server-side even if
        // this confirmation call itself fails on a replay; leave it removed.
      });
    }
    removeItemLocally(itemId);
  };

  const moveItem = (itemId: string, offset: 1 | -1) => {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === itemId);
      const targetIndex = index + offset;
      if (index === -1 || targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const canConfirm = items.length > 0 && items.every((item) => item.status === 'uploaded');

  const backTo = {
    to: '/classes/$classId/assignments/$assignmentId' as const,
    params: { classId, assignmentId },
    search: defaultSubmissionsSearch,
  };

  return (
    <UploadFlowView
      title={documentType === 'materials' ? 'Upload materials' : 'Upload submission'}
      description={
        documentType === 'materials'
          ? 'Add each page photo for this assignment’s materials, in the order students should see them.'
          : 'Add each page photo for this student’s submission, in the order they appear.'
      }
      items={items.map(
        (item): UploadFlowItem => ({
          id: item.id,
          fileName: item.fileName,
          status: item.status,
          errorMessage: item.errorMessage,
          isExisting: item.isExisting,
        }),
      )}
      maxPages={MAX_DOCUMENT_PAGES}
      onFilesSelected={addFiles}
      onReplace={handleReplace}
      onRemove={handleRemove}
      onMoveUp={(id) => moveItem(id, -1)}
      onMoveDown={(id) => moveItem(id, 1)}
      isLoadingExisting={existingPages.isLoading}
      bannerMessage={bannerMessage}
      canConfirm={canConfirm}
      isConfirming={confirmDocument.isPending}
      confirmError={confirmDocument.error instanceof SeatingApiError ? confirmDocument.error.message : null}
      onConfirm={() => {
        confirmDocument.mutate(
          { pageIds: items.map((item) => item.pageId as string) },
          { onSuccess: () => void navigate(backTo) },
        );
      }}
      backLink={
        <Link
          to={backTo.to}
          params={backTo.params}
          search={backTo.search}
          className="inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to assignment
        </Link>
      }
    />
  );
}
