import type { ProcessingCounts } from '@classprints/assignment-reader-shared';

export { formatElapsed } from '../../lib/assignment-reader-format';

/**
 * A document is "settled" once no current page is actively
 * uploading/queued/transcribing — a `failed` page needs teacher recovery
 * but is not itself in flight. Used to decide when the per-page elapsed-time
 * ticker can stop, independent of `processingRefetchInterval`'s own (looser)
 * "has the document reached `completed`" polling rule.
 */
export function isDocumentSettled(counts: ProcessingCounts): boolean {
  return counts.uploading === 0 && counts.queued === 0 && counts.transcribing === 0;
}
