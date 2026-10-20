// Lazy route chunks are content-hashed, so a tab that stays open across a
// deploy can ask for a chunk that no longer exists. The asset worker answers
// that request with the SPA fallback (index.html), which the browser then
// rejects as a module. Reloading picks up the new entry chunk and its hashes.

const RELOAD_KEY = 'seating:chunk-reload-at';
const RELOAD_COOLDOWN_MS = 10_000;

const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return CHUNK_ERROR_PATTERN.test(message);
}

/** Reloads once per cooldown window; returns false if it declined (loop guard). */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // sessionStorage can be unavailable; reload anyway rather than stay broken.
  }
  window.location.reload();
  return true;
}
