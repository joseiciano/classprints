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
import { assignmentReaderKeys } from '../../lib/assignment-reader-query-keys';
import { SeatingApiError } from '../../lib/http';
import { UploadFlowView, type UploadFlowItem } from './upload-flow-view';

const MAX_PAGES = 20;
const MAX_FILE_BYTES = 10_000_000;
const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.heic', '.heif'];
const ACCEPTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif']);
const UPLOAD_CONCURRENCY = 3;

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

function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_MIME_TYPES.has(file.type)) return true;
  const lowerName = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

function messageFor(error: unknown): string {
  return error instanceof SeatingApiError ? error.message : 'Upload failed. Try again.';
}

/**
 * The single shared ordered upload flow (TASK-022): used for both material
 * and submission documents. Each file is its own independent one-page
 * upload request — never a presigned URL or one giant request — uploaded
 * with bounded concurrency 3. Client-side checks are UX only; the server
 * remains the source of truth and its validation is surfaced per row.
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
  const inFlightRef = useRef(new Set<string>());
  const itemsRef = useRef<QueueItem[]>([]);
  itemsRef.current = items;

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

  // Bounded-concurrency uploader: whenever `items` changes, fill any free
  // slot (up to UPLOAD_CONCURRENCY) with the next queued row.
  useEffect(() => {
    let cancelled = false;

    const launch = (item: QueueItem) => {
      inFlightRef.current.add(item.id);
      updateItem(item.id, { status: 'uploading', errorMessage: undefined });
      uploadDocumentPage(documentType, documentId, item.file as File)
        .then((page) => {
          if (cancelled) return;
          updateItem(item.id, { pageId: page.id, status: 'uploaded', fileName: page.label });
        })
        .catch((error) => {
          if (cancelled) return;
          updateItem(item.id, { status: 'failed', errorMessage: messageFor(error) });
        })
        .finally(() => {
          inFlightRef.current.delete(item.id);
          if (!cancelled) fillSlots();
        });
    };

    const fillSlots = () => {
      while (inFlightRef.current.size < UPLOAD_CONCURRENCY) {
        const next = itemsRef.current.find(
          (item) => item.status === 'queued' && !inFlightRef.current.has(item.id),
        );
        if (!next) return;
        launch(next);
      }
    };

    fillSlots();
    return () => {
      cancelled = true;
    };
  }, [items, documentType, documentId]);

  const addFiles = (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    const currentCount = itemsRef.current.length;
    const room = MAX_PAGES - currentCount;
    if (room <= 0) {
      setBannerMessage(`This document already has the maximum of ${MAX_PAGES} pages.`);
      return;
    }

    const accepted: QueueItem[] = [];
    let rejectedReason: string | null = null;
    for (const file of incoming.slice(0, room)) {
      if (!isAcceptedFile(file)) {
        rejectedReason = `"${file.name}" is not a JPEG, PNG, or HEIC image.`;
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        rejectedReason = `"${file.name}" is larger than 10 MB.`;
        continue;
      }
      accepted.push({
        id: nextLocalId(),
        file,
        pageId: null,
        fileName: file.name,
        status: 'queued',
        isExisting: false,
      });
    }
    if (incoming.length > room) {
      rejectedReason = `Only ${room} more page${room === 1 ? '' : 's'} can be added (${MAX_PAGES} max).`;
    }
    setBannerMessage(rejectedReason);
    if (accepted.length > 0) {
      setItems((current) => [...current, ...accepted]);
    }
  };

  const handleReplace = (itemId: string, file: File) => {
    if (!isAcceptedFile(file)) {
      updateItem(itemId, { errorMessage: 'Only JPEG, PNG, or HEIC images are supported.' });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      updateItem(itemId, { errorMessage: 'File is larger than 10 MB.' });
      return;
    }
    const item = itemsRef.current.find((candidate) => candidate.id === itemId);
    if (!item) return;

    if (!item.pageId) {
      // Never made it to the server; just re-queue with the new file.
      updateItem(itemId, { file, fileName: file.name, status: 'queued', errorMessage: undefined });
      return;
    }

    updateItem(itemId, { status: 'uploading', errorMessage: undefined });
    replacePageImage(item.pageId, file)
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
      maxPages={MAX_PAGES}
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
          className="inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to assignment
        </Link>
      }
    />
  );
}
