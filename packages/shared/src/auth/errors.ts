import type { AuthCopy, AuthErrorInfo } from '@classprints/shared';
import { ApiError } from '../errors';

const statusToFriendlyKey: Partial<Record<number, keyof AuthCopy['errors']>> = {
  401: 'invalidCredentials',
  403: 'verificationRequired',
  409: 'emailInUse',
};

type ErrorMatcher = {
  key: keyof AuthCopy['errors'];
  test: (error: ApiError) => boolean;
};

const normalizedIncludes = (needle: string, haystack?: string) =>
  (haystack ?? '').toLowerCase().includes(needle);

const matchers: ErrorMatcher[] = [
  {
    key: 'csrfInvalid',
    test: (error) => normalizedIncludes('csrf', error.message),
  },
  {
    key: 'emailInUse',
    test: (error) => normalizedIncludes('already in use', error.message),
  },
  {
    key: 'weakPassword',
    test: (error) =>
      normalizedIncludes('password', error.message) &&
      (normalizedIncludes('weak', error.message) || normalizedIncludes('at least', error.message)),
  },
];

const resolveFriendlyKey = (error: ApiError): keyof AuthCopy['errors'] | undefined => {
  const matcher = matchers.find(({ test }) => test(error));
  if (matcher) {
    return matcher.key;
  }

  if (typeof error.status === 'number') {
    return statusToFriendlyKey[error.status];
  }

  return undefined;
};

export class AuthError extends Error {
  constructor(public readonly info: AuthErrorInfo) {
    super(info.friendlyMessage);
    this.name = 'AuthError';
  }
}

const resolveFromApiError = (error: ApiError, copy: AuthCopy): AuthErrorInfo => {
  const friendlyKey = resolveFriendlyKey(error) ?? 'default';

  return {
    code: error.code,
    message: error.message,
    friendlyMessage: copy.errors[friendlyKey],
  };
};

export const resolveAuthError = (error: unknown, copy: AuthCopy): AuthErrorInfo => {
  if (error instanceof AuthError) {
    return error.info;
  }

  if (error instanceof ApiError) {
    return resolveFromApiError(error, copy);
  }

  return {
    code: 'unknown',
    message: 'Unknown error',
    friendlyMessage: copy.errors.default,
  };
};

export const toAuthError = (error: unknown, copy: AuthCopy): AuthError =>
  error instanceof AuthError ? error : new AuthError(resolveAuthError(error, copy));
