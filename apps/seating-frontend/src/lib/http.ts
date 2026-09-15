import { ApiError, callWorkerEndpoint, type WorkerRequestOptions } from '@classprints/shared';

const API_PREFIX = '/api/v1';

export class SeatingApiError extends ApiError {
  constructor(
    message: string,
    status?: number,
    details?: unknown,
    code = 'SEATING_REQUEST_FAILED',
  ) {
    super(code, message, status, details);
    this.name = 'SeatingApiError';
  }

  static fromApiError(error: ApiError): SeatingApiError {
    return new SeatingApiError(error.message, error.status, error.details, error.code);
  }
}

export const seatingWorkerFetcher: typeof callWorkerEndpoint = (path, options, retryCount) => {
  const normalizedPath = path.startsWith(API_PREFIX)
    ? path
    : `${API_PREFIX}${path.startsWith('/') ? path : `/${path}`}`;
  return callWorkerEndpoint(normalizedPath, options, retryCount);
};

export async function request<T>(path: string, options?: WorkerRequestOptions): Promise<T> {
  const normalizedOptions: WorkerRequestOptions = options ? { ...options } : { method: 'GET' };
  if (!normalizedOptions.method) {
    normalizedOptions.method = 'GET';
  }

  try {
    return await seatingWorkerFetcher<T>(path, normalizedOptions);
  } catch (error) {
    if (error instanceof ApiError) {
      throw SeatingApiError.fromApiError(error);
    }
    throw error;
  }
}
