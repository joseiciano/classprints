import type { ContentfulStatusCode } from 'hono/utils/http-status';

export class HttpError extends Error {
  public readonly status: ContentfulStatusCode;
  public readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = (status >= 200 && status <= 599 ? status : 500) as ContentfulStatusCode;
    this.details = details;
  }
}

export const isHttpError = (error: unknown): error is HttpError => error instanceof HttpError;
