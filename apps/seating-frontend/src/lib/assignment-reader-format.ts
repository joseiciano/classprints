/** Teacher-facing date formatting shared across every Assignment Reader list/detail view. */
export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatScore(score: number | null, maxScore: number | null): string {
  if (score === null) return '—';
  return maxScore !== null ? `${score} / ${maxScore}` : String(score);
}

/**
 * Formats a millisecond duration as "m:ss" (or "h:mm:ss" past an hour) for
 * the processing list's live elapsed-time display (TASK-023). The caller
 * computes the duration itself, client-side, from the page's `queuedAt`
 * timestamp on every tick — nothing here is persisted to the server.
 */
export function formatElapsed(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
