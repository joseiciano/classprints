import type { QueryClient } from '@tanstack/react-query';
import type { AuthUser } from '@classprints/shared';
import { authQueryKeys } from './query-keys';
import {
  sessionClient as defaultSessionClient,
  type SessionClient,
  createSessionClient,
} from '../http/session-client';
import { ApiError } from '../errors';
import { TokenRefreshManager, type TokenRefreshManagerOptions } from './token-refresh-manager';

export interface SubscribeToAuthStateOptions {
  queryClient: QueryClient;
  sessionClient?: SessionClient;
  onUserChanged?: (user: AuthUser | null) => Promise<void> | void;
  onSessionRefreshed?: (user: AuthUser | null) => Promise<void> | void;
  enableProactiveRefresh?: boolean;
  refreshConfig?: Pick<
    TokenRefreshManagerOptions,
    'refreshBeforeExpiryMs' | 'tokenLifetimeMs' | 'baseUrl'
  >;
}

const serializeUser = (user: AuthUser | null): string => (user ? JSON.stringify(user) : 'null');

const shouldTreatAsUnauthorized = (error: ApiError): boolean => {
  if (typeof error.status === 'number') {
    return [401, 403].includes(error.status);
  }
  return false;
};

export const subscribeToAuthState = (options: SubscribeToAuthStateOptions) => {
  const {
    queryClient,
    onUserChanged,
    onSessionRefreshed,
    enableProactiveRefresh = false,
    refreshConfig,
  } = options;

  const client = options.sessionClient ?? defaultSessionClient ?? createSessionClient();

  let stopped = false;
  let lastUserSignature: string | null = null;

  // Create TokenRefreshManager if proactive refresh is enabled
  let tokenRefreshManager: TokenRefreshManager | null = null;
  if (enableProactiveRefresh) {
    tokenRefreshManager = new TokenRefreshManager({
      ...refreshConfig,
      onRefreshSuccess: () => {
        // Fetch session to update cache after successful proactive refresh
        void fetchSession();
      },
      onRefreshError: (error) => {
        // On refresh error (session expired), log out the user
        console.error('[TokenRefresh] Refresh failed, logging out user:', error);
        void updateUser(null);
      },
    });
  }

  let initializationCompleted = false;

  const updateUser = async (user: AuthUser | null) => {
    const signature = serializeUser(user);
    if (signature === lastUserSignature) {
      await onSessionRefreshed?.(user ?? null);
      return;
    }

    lastUserSignature = signature;
    queryClient.setQueryData(authQueryKeys.session(), user);
    await queryClient.invalidateQueries({ queryKey: authQueryKeys.root });

    // Start token refresh manager when user is authenticated
    if (tokenRefreshManager) {
      if (user) {
        tokenRefreshManager.start();
      } else {
        tokenRefreshManager.stop();
      }
    }

    initializationCompleted = true;
    await onUserChanged?.(user ?? null);
    await onSessionRefreshed?.(user ?? null);
  };

  const fetchSession = async (retryCount = 0): Promise<void> => {
    if (stopped) {
      return;
    }

    // Wait for tokens to be ready (if platform supports it)
    if (client.waitForTokensReady) {
      await client.waitForTokensReady();

      // After waiting, verify tokens are actually available
      if (client.areTokensAvailable && !client.areTokensAvailable()) {
        await updateUser(null);
        return;
      }
    }

    // Skip network request if no tokens are available (if platform supports token checking)
    if (client.areTokensAvailable && !client.areTokensAvailable()) {
      await updateUser(null);
      return;
    }

    try {
      const user = await client.getSession();

      // If no user but tokens exist, the access token might be expired - try refreshing
      if (
        !user &&
        client.areTokensAvailable &&
        client.areTokensAvailable() &&
        client.refreshTokens
      ) {
        try {
          const refreshedUser = await client.refreshTokens();
          await updateUser(refreshedUser);
          return;
        } catch (refreshError) {
          // Token refresh failed, user is logged out
          // Fall through to update user as null
        }
      }

      await updateUser(user);
    } catch (error) {
      // 1. Auth errors (401/403) - Expected behavior
      if (error instanceof ApiError && shouldTreatAsUnauthorized(error)) {
        await updateUser(null);
        return;
      }

      // 2. Network errors - Retry with backoff
      if (error instanceof ApiError && error.code === 'NETWORK_ERROR') {
        if (retryCount < 3) {
          const delayMs = 1000 * Math.pow(2, retryCount);
          console.warn(
            `[AuthObserver] Network error, retrying in ${delayMs}ms (${retryCount + 1}/3)`,
            error,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          await fetchSession(retryCount + 1);
          return;
        }
        console.error('[AuthObserver] Max retries exceeded, initializing without session', error);
      }
      // 3. Config/unknown errors - Log and fail gracefully
      else if (error instanceof ApiError && error.code === 'CONFIG_ERROR') {
        console.error('[AuthObserver] Configuration error during session fetch', error);
      } else {
        console.error('[AuthObserver] Unexpected error during session fetch', error);
      }

      // Always complete initialization
      await updateUser(null);
    }
  };

  // Kick off the initial fetch so session recovery from cookies happens ASAP
  void fetchSession();

  // Timeout safety net: ensure initialization completes even if fetchSession hangs
  setTimeout(() => {
    if (!stopped && !initializationCompleted) {
      console.error('[AuthObserver] Session fetch timeout (10s), initializing without session');
      void updateUser(null);
    }
  }, 6000);

  // Subscribe to query cache changes for the session key
  // This allows the observer to detect when mutations update the user session
  // (e.g., when signIn or signUp mutations succeed)
  const unsubscribeFromCache = queryClient.getQueryCache().subscribe((event) => {
    // Check if this is an update to the session query
    if (event.query.queryKey[0] === 'auth' && event.query.queryKey[1] === 'session') {
      // Only handle state changes (not loading/error state changes)
      if (event.type === 'updated') {
        const user = (event.query.state.data as AuthUser | null) ?? null;
        void updateUser(user);
      }
    }
  });

  return () => {
    stopped = true;
    unsubscribeFromCache();

    // Stop token refresh manager on cleanup
    if (tokenRefreshManager) {
      tokenRefreshManager.stop();
    }
  };
};
