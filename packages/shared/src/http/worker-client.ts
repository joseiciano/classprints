import { ApiError, type FetcherErrorPayload } from '../errors';
import { readEnv, isLocalHost } from '../runtime-env';
import { getWorkerClientConfig } from './config';

const trimTrailingSlash = (value: string) => value.replace(/\/$/, '');

// Promise-based lock to prevent concurrent token refresh attempts
let refreshPromise: Promise<void> | null = null;

// Track the last successful token refresh time
let lastRefreshTimestamp: number = Date.now();

type WorkerClientRequestInit = Omit<RequestInit, 'headers'> & {
  headers: Record<string, string>;
};

export interface WorkerRequestContext {
  path: string;
  url: string;
  options: WorkerRequestOptions;
  init: WorkerClientRequestInit;
  retryCount: number;
}

export interface WorkerResponseContext extends WorkerRequestContext {
  response: Response;
}

export type WorkerRequestInterceptor = (context: WorkerRequestContext) => void | Promise<void>;
export type WorkerResponseInterceptor = (context: WorkerResponseContext) => void | Promise<void>;

let workerRequestInterceptor: WorkerRequestInterceptor | null = null;
let workerResponseInterceptor: WorkerResponseInterceptor | null = null;

export const setWorkerRequestInterceptor = (
  interceptor?: WorkerRequestInterceptor | null,
): void => {
  workerRequestInterceptor = interceptor ?? null;
};

export const setWorkerResponseInterceptor = (
  interceptor?: WorkerResponseInterceptor | null,
): void => {
  workerResponseInterceptor = interceptor ?? null;
};

export const invokeRequestInterceptor = async (context: WorkerRequestContext): Promise<void> => {
  if (workerRequestInterceptor) {
    await workerRequestInterceptor(context);
  }
};

export const invokeResponseInterceptor = async (context: WorkerResponseContext): Promise<void> => {
  if (workerResponseInterceptor) {
    await workerResponseInterceptor(context);
  }
};

/**
 * Get the timestamp of the last successful token refresh.
 * @returns Unix timestamp in milliseconds
 */
export const getLastRefreshTime = (): number => lastRefreshTimestamp;

/**
 * Refreshes authentication tokens by calling the /auth/exchange-tokens endpoint.
 * Uses a promise-based lock to ensure only one refresh operation happens at a time.
 */
export const refreshTokens = async (baseUrl?: string): Promise<void> => {
  // If refresh is already in progress, wait for it
  if (refreshPromise) {
    return refreshPromise;
  }

  // Create new refresh promise
  refreshPromise = (async () => {
    try {
      const { apiPrefix = '' } = getWorkerClientConfig();
      const path = `${apiPrefix}/auth/exchange-tokens`.replace(/\/+/g, '/');

      await callWorkerEndpoint(path, {
        baseUrl,
        method: 'POST',
        credentials: 'include',
      });

      lastRefreshTimestamp = Date.now();
    } finally {
      // Clear the promise so future requests can trigger a new refresh
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

export const resolveWorkerBaseUrl = (override?: string): string => {
  if (override) {
    return trimTrailingSlash(override);
  }

  const { baseUrlEnvKeys, localDevPort } = getWorkerClientConfig();

  for (const key of baseUrlEnvKeys) {
    const envBase = readEnv(key);
    if (envBase) {
      const sanitizedEnvBase = envBase.trim().split(/\s+/)[0];
      return trimTrailingSlash(sanitizedEnvBase);
    }
  }

  if (isLocalHost()) {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
    const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
    const normalizedProtocol = protocol === 'https:' ? 'https' : 'http';
    return `${normalizedProtocol}://${hostname}:${localDevPort}`;
  }

  throw new ApiError('CONFIG_ERROR', 'Worker base URL is not configured');
};

export interface WorkerRequestOptions {
  baseUrl?: string;
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
}

export const callWorkerEndpoint = async <T>(
  path: string,
  options: WorkerRequestOptions,
  retryCount = 0,
): Promise<T> => {
  const { baseUrl, method = 'POST', body, signal, headers: extraHeaders, credentials } = options;
  const url = `${resolveWorkerBaseUrl(baseUrl)}${path.startsWith('/') ? path : `/${path}`}`;
  const headers: Record<string, string> = { ...(extraHeaders ?? {}) };

  let requestBody: BodyInit | undefined;
  if (body !== undefined) {
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    requestBody = JSON.stringify(body);
  }

  const init: WorkerClientRequestInit = {
    method,
    headers,
    body: requestBody,
    signal,
    credentials: credentials ?? 'include',
  };

  const requestContext: WorkerRequestContext = {
    path,
    url,
    options,
    init,
    retryCount,
  };

  await invokeRequestInterceptor(requestContext);

  let response: Response;
  try {
    response = await fetch(requestContext.url, requestContext.init);
  } catch (error) {
    throw new ApiError('NETWORK_ERROR', error instanceof Error ? error.message : 'Network error');
  }

  await invokeResponseInterceptor({ ...requestContext, response });

  // Handle 401 - token expired
  if (response.status === 401 && retryCount === 0) {
    // Don't retry the refresh endpoint itself
    if (path.includes('/auth/exchange-tokens')) {
      let payload: FetcherErrorPayload | undefined;
      try {
        payload = (await response.json()) as FetcherErrorPayload;
      } catch {
        // Ignore JSON parsing failures
      }

      const errorMessage =
        (typeof payload?.message === 'string' && payload.message.length > 0 && payload.message) ||
        'Session expired. Please sign in again.';

      const errorCode =
        (typeof payload?.code === 'string' && payload.code.length > 0 && payload.code) ||
        'SESSION_EXPIRED';

      throw new ApiError(errorCode, errorMessage, response.status, payload?.details);
    }

    // Attempt to refresh tokens and retry the original request; any error naturally bubbles up.
    await refreshTokens(baseUrl);

    return callWorkerEndpoint<T>(path, options, retryCount + 1);
  }

  // Handle other non-OK responses
  if (!response.ok) {
    let payload: FetcherErrorPayload | undefined;
    try {
      payload = (await response.json()) as FetcherErrorPayload;
    } catch {
      // Ignore JSON parsing failures for error payloads.
    }

    const errorMessage =
      (typeof payload?.message === 'string' && payload.message.length > 0 && payload.message) ||
      (typeof payload?.error === 'string' && payload.error.length > 0 && payload.error) ||
      'Unable to complete the request';

    const errorCode =
      (typeof payload?.code === 'string' && payload.code.length > 0 && payload.code) ||
      'WORKER_REQUEST_FAILED';

    throw new ApiError(errorCode, errorMessage, response.status, payload?.details);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  try {
    return (await response.json()) as T;
  } catch {
    return undefined as T;
  }
};
