import type { DocumentProcessingResponse } from '@classprints/assignment-reader-shared';

export type PageVisibility = 'visible' | 'hidden';

/**
 * TASK-023's polling rule: every 3000 ms while the tab is visible and the
 * document's rollup has not yet reached `completed`. A `failed` rollup still
 * polls — a page can be retried or recovered (including from another
 * session) without this tab's teacher taking any action here, so the view
 * keeps syncing until the document is genuinely settled, not merely once
 * nothing is actively uploading/queued/transcribing.
 */
export function processingRefetchInterval(
  response: DocumentProcessingResponse | undefined,
  visibility: PageVisibility,
): number | false {
  if (visibility === 'hidden') return false;
  if (!response) return false;
  return response.processingState === 'completed' ? false : 3000;
}
