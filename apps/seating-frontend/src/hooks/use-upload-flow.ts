/**
 * Pure helpers backing the shared ordered upload flow (TASK-022). Kept
 * framework- and fetch-free so they can be unit tested directly: client
 * validation is UX only (the server remains the source of truth), and the
 * concurrency pool is a generic bounded-parallelism `Promise.allSettled`
 * that preserves input order regardless of completion order.
 */

export const MAX_UPLOAD_FILE_BYTES = 10_000_000;
export const MAX_DOCUMENT_PAGES = 20;
export const UPLOAD_CONCURRENCY = 3;

const ACCEPTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif']);
const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.heic', '.heif'];

export type UploadFileLike = Pick<File, 'name' | 'size' | 'type'>;

/**
 * Validates one file against the material/submission page upload contract
 * (JPEG/PNG/HEIC, byte-signature-equivalent client check by extension or
 * MIME type, and the 10,000,000-byte limit). Returns `null` when the file
 * is acceptable, or a short teacher-displayable reason otherwise.
 */
export function validateUploadFile(file: UploadFileLike): string | null {
  const lowerName = file.name.toLowerCase();
  const hasAcceptedExtension = ACCEPTED_EXTENSIONS.some((extension) =>
    lowerName.endsWith(extension),
  );
  const hasAcceptedMimeType = ACCEPTED_MIME_TYPES.has(file.type);
  if (!hasAcceptedExtension && !hasAcceptedMimeType) {
    return 'Not uploaded · JPEG, PNG, or HEIC required';
  }
  if (file.size > MAX_UPLOAD_FILE_BYTES) {
    return 'Not uploaded · over limit';
  }
  return null;
}

/**
 * Validates that a file can still be added given how many pages are
 * already occupied (uploaded or in flight) on the document, mirroring the
 * server's 20-page ceiling.
 */
export function validateUploadSelection(
  _file: UploadFileLike,
  occupiedPageCount: number,
): string | null {
  if (occupiedPageCount >= MAX_DOCUMENT_PAGES) {
    return 'Not uploaded · 20-page limit reached';
  }
  return null;
}

/**
 * Runs `worker` over `items` with at most `concurrency` active at once,
 * returning settled results in the same order as `items` regardless of
 * completion order. A slot frees as soon as its worker settles, so a fast
 * early item never blocks a later one from starting.
 */
export function uploadWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  return new Promise((resolve) => {
    const results: PromiseSettledResult<R>[] = new Array(items.length);
    if (items.length === 0) {
      resolve(results);
      return;
    }

    let nextIndex = 0;
    let completedCount = 0;

    const launchNext = () => {
      const index = nextIndex;
      if (index >= items.length) return;
      nextIndex += 1;

      worker(items[index] as T, index)
        .then((value) => {
          results[index] = { status: 'fulfilled', value };
        })
        .catch((reason: unknown) => {
          results[index] = { status: 'rejected', reason };
        })
        .finally(() => {
          completedCount += 1;
          if (completedCount === items.length) {
            resolve(results);
          } else {
            launchNext();
          }
        });
    };

    const initialWorkers = Math.min(concurrency, items.length);
    for (let i = 0; i < initialWorkers; i += 1) {
      launchNext();
    }
  });
}
