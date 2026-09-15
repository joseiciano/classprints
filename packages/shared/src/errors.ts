export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type FetcherErrorPayload = {
  code?: string;
  error?: string;
  message?: string;
  details?: unknown;
};
