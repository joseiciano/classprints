import { ApiError } from '../errors';
import { refreshTokens as refreshTokensImpl, getLastRefreshTime } from '../http/worker-client';

export interface TokenRefreshManagerOptions {
  /**
   * Time before token expiry to trigger proactive refresh (in milliseconds)
   * Default: 50 minutes (50 * 60 * 1000)
   */
  refreshBeforeExpiryMs?: number;

  /**
   * Total token lifetime (in milliseconds)
   * Default: 60 minutes (60 * 60 * 1000)
   */
  tokenLifetimeMs?: number;

  /**
   * Callback invoked after successful token refresh
   */
  onRefreshSuccess?: () => void;

  /**
   * Callback invoked when token refresh fails
   * - Auth errors (401/SESSION_EXPIRED): User should be logged out
   * - Network errors: Will be retried automatically
   */
  onRefreshError?: (error: Error) => void;

  /**
   * Optional base URL override for the worker API
   */
  baseUrl?: string;
}

const DEFAULT_REFRESH_BEFORE_EXPIRY_MS = 50 * 60 * 1000; // 50 minutes
const DEFAULT_TOKEN_LIFETIME_MS = 60 * 60 * 1000; // 60 minutes
const VISIBILITY_REFRESH_THRESHOLD_MS = 55 * 60 * 1000; // 55 minutes
const SLEEP_DETECTION_DRIFT_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 2000; // 2 seconds

/**
 * Manages proactive token refresh to keep users authenticated during inactivity.
 *
 * Features:
 * - Background timer for scheduled refresh before token expiry
 * - Page Visibility API integration to refresh on tab activation
 * - Browser sleep/wake detection via timer drift
 * - Exponential backoff retry for network errors
 * - Promise-based locking (reuses worker-client lock)
 */
export class TokenRefreshManager {
  private options: Required<
    Omit<TokenRefreshManagerOptions, 'onRefreshSuccess' | 'onRefreshError' | 'baseUrl'>
  > &
    Pick<TokenRefreshManagerOptions, 'onRefreshSuccess' | 'onRefreshError' | 'baseUrl'>;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private scheduledRefreshTime: number | null = null;
  private isActive = false;
  private visibilityChangeHandler: (() => void) | null = null;

  constructor(options: TokenRefreshManagerOptions = {}) {
    this.options = {
      refreshBeforeExpiryMs: options.refreshBeforeExpiryMs ?? DEFAULT_REFRESH_BEFORE_EXPIRY_MS,
      tokenLifetimeMs: options.tokenLifetimeMs ?? DEFAULT_TOKEN_LIFETIME_MS,
      onRefreshSuccess: options.onRefreshSuccess,
      onRefreshError: options.onRefreshError,
      baseUrl: options.baseUrl,
    };
  }

  /**
   * Start the token refresh manager.
   * Schedules the initial refresh and sets up visibility change listener.
   */
  start(): void {
    if (this.isActive) {
      return;
    }

    this.isActive = true;
    this.scheduleNextRefresh();
    this.setupVisibilityListener();
  }

  /**
   * Stop the token refresh manager.
   * Clears timers and removes event listeners.
   */
  stop(): void {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;
    this.clearTimer();
    this.removeVisibilityListener();
  }

  /**
   * Force an immediate token refresh.
   * Useful for manual refresh triggers.
   */
  async forceRefresh(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    await this.executeRefreshWithRetry();
  }

  /**
   * Schedule the next token refresh based on refresh timing configuration.
   */
  private scheduleNextRefresh(): void {
    this.clearTimer();

    const delayMs = this.options.refreshBeforeExpiryMs;
    this.scheduledRefreshTime = Date.now() + delayMs;

    this.timerId = setTimeout(() => {
      void this.handleTimerFire();
    }, delayMs);
  }

  /**
   * Handle timer expiration.
   * Checks for browser sleep/wake and executes refresh.
   */
  private async handleTimerFire(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    // Detect browser sleep: if actual time is significantly later than scheduled time
    const now = Date.now();
    const expectedTime = this.scheduledRefreshTime ?? now;
    const timeDrift = now - expectedTime;

    if (timeDrift > SLEEP_DETECTION_DRIFT_MS) {
      // Browser likely slept/hibernated, force immediate refresh
      console.log('[TokenRefresh] Browser sleep detected, forcing immediate refresh');
    }

    await this.executeRefreshWithRetry();
  }

  /**
   * Execute token refresh with exponential backoff retry for network errors.
   */
  private async executeRefreshWithRetry(attempt = 1): Promise<void> {
    if (!this.isActive) {
      return;
    }

    try {
      await refreshTokensImpl(this.options.baseUrl);

      // Success - schedule next refresh and notify
      this.scheduleNextRefresh();
      this.options.onRefreshSuccess?.();
    } catch (error) {
      const isAuthError =
        error instanceof ApiError &&
        (error.code === 'SESSION_EXPIRED' ||
          error.code === 'TOKEN_REFRESH_FAILED' ||
          error.status === 401);

      if (isAuthError) {
        // Auth error - don't retry, user needs to re-login
        console.error('[TokenRefresh] Authentication failed, session expired');
        this.stop();
        this.options.onRefreshError?.(error as Error);
        return;
      }

      // Network error - retry with exponential backoff
      if (attempt < MAX_RETRY_ATTEMPTS) {
        const retryDelayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(
          `[TokenRefresh] Network error, retrying in ${retryDelayMs}ms (attempt ${attempt}/${MAX_RETRY_ATTEMPTS})`,
        );

        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        await this.executeRefreshWithRetry(attempt + 1);
      } else {
        // Max retries exceeded - log error and schedule next refresh anyway
        console.error(
          '[TokenRefresh] Max retry attempts exceeded, will try again at next scheduled time',
        );
        this.scheduleNextRefresh();
        this.options.onRefreshError?.(error as Error);
      }
    }
  }

  /**
   * Set up Page Visibility API listener to refresh on tab activation.
   */
  private setupVisibilityListener(): void {
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
      return; // Not in browser environment
    }

    this.visibilityChangeHandler = () => {
      void this.handleVisibilityChange();
    };

    document.addEventListener('visibilitychange', this.visibilityChangeHandler);
  }

  /**
   * Handle visibility change event.
   * If tab becomes visible and enough time has passed, trigger refresh.
   */
  private async handleVisibilityChange(): Promise<void> {
    if (!this.isActive || typeof document === 'undefined') {
      return;
    }

    // Only refresh when page becomes visible (not when it becomes hidden)
    if (document.visibilityState !== 'visible') {
      return;
    }

    const lastRefreshTime = getLastRefreshTime();
    const timeSinceLastRefresh = Date.now() - lastRefreshTime;

    // If it's been longer than the threshold since last refresh, refresh now
    if (timeSinceLastRefresh > VISIBILITY_REFRESH_THRESHOLD_MS) {
      console.log('[TokenRefresh] Tab became visible after extended period, refreshing tokens');
      await this.executeRefreshWithRetry();
    }
  }

  /**
   * Remove visibility change listener.
   */
  private removeVisibilityListener(): void {
    if (
      this.visibilityChangeHandler &&
      typeof document !== 'undefined' &&
      typeof document.removeEventListener === 'function'
    ) {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
      this.visibilityChangeHandler = null;
    }
  }

  /**
   * Clear the current refresh timer.
   */
  private clearTimer(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
      this.scheduledRefreshTime = null;
    }
  }
}
