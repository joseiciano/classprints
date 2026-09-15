import type {
  AuthUser,
  PasswordResetValues,
  SignInValues,
  SignUpValues,
  VerificationValues,
} from '@classprints/shared';
import { readCsrfToken, getCsrfHeaderName } from '@classprints/shared';
import { callWorkerEndpoint, type WorkerRequestOptions } from './worker-client';
import { mapWorkerUser } from '../auth/user';

interface WorkerAuthUserPayload {
  id: string;
  email: string | null;
  displayName: string | null;
  emailVerified?: boolean;
  emailNotificationsEnabledAt?: string | null;
}

interface SessionResponse {
  user: WorkerAuthUserPayload | null;
}

interface AuthResponse {
  user: WorkerAuthUserPayload;
}

export interface SessionClient {
  signIn(values: SignInValues): Promise<AuthUser>;
  signUp(values: SignUpValues): Promise<AuthUser>;
  signOut(): Promise<void>;
  getSession(): Promise<AuthUser | null>;
  requestPasswordReset(values: PasswordResetValues): Promise<void>;
  resendVerification(values: VerificationValues): Promise<void>;
  refreshTokens?(): Promise<AuthUser>;
  // Optional methods for platforms that manage tokens locally (e.g., React Native)
  waitForTokensReady?(): Promise<void>;
  areTokensAvailable?(): boolean;
}

export interface SessionClientOptions {
  baseUrl?: string;
  csrfTokenReader?: () => string | null;
  fetcher?: typeof callWorkerEndpoint;
}

const normalizeRemember = (remember?: boolean) => remember ?? true;

const defaultCsrfReader = () => readCsrfToken();

const invoke = async <T>(
  path: string,
  options: WorkerRequestOptions,
  fetcher: typeof callWorkerEndpoint,
): Promise<T> => fetcher<T>(path, options);

const toAuthUser = (payload: WorkerAuthUserPayload): AuthUser =>
  mapWorkerUser({
    id: payload.id,
    email: payload.email ?? null,
    displayName: payload.displayName ?? null,
    emailVerified: payload.emailVerified ?? false,
    emailNotificationsEnabledAt: payload.emailNotificationsEnabledAt ?? null,
  });

export const createSessionClient = (options: SessionClientOptions = {}): SessionClient => {
  const fetcher = options.fetcher ?? callWorkerEndpoint;
  const readCsrf = options.csrfTokenReader ?? defaultCsrfReader;

  return {
    areTokensAvailable: () => !!readCsrf(),
    async signIn(values) {
      const response = await invoke<AuthResponse>(
        '/auth/sign-in',
        {
          baseUrl: options.baseUrl,
          method: 'POST',
          body: {
            email: values.email,
            password: values.password,
            remember: normalizeRemember(values.remember),
          },
          credentials: 'include',
        },
        fetcher,
      );
      return toAuthUser(response.user);
    },
    async signUp(values) {
      const { displayName, remember, email, password, confirmPassword } = values;
      const response = await invoke<AuthResponse>(
        '/auth/sign-up',
        {
          baseUrl: options.baseUrl,
          method: 'POST',
          body: {
            email,
            password,
            confirmPassword,
            displayName,
            remember: normalizeRemember(remember),
          },
          credentials: 'include',
        },
        fetcher,
      );
      return toAuthUser(response.user);
    },
    async signOut() {
      const csrfToken = readCsrf();

      await invoke(
        '/auth/sign-out',
        {
          baseUrl: options.baseUrl,
          method: 'POST',
          headers: csrfToken ? { [getCsrfHeaderName()]: csrfToken } : undefined,
          credentials: 'include',
        },
        fetcher,
      );
    },
    async getSession() {
      const response = await invoke<SessionResponse>(
        '/auth/session',
        {
          baseUrl: options.baseUrl,
          method: 'GET',
          credentials: 'include',
        },
        fetcher,
      );

      return response.user ? toAuthUser(response.user) : null;
    },
    async requestPasswordReset(values) {
      await invoke(
        '/auth/password-reset',
        {
          baseUrl: options.baseUrl,
          method: 'POST',
          body: { email: values.email },
          credentials: 'include',
        },
        fetcher,
      );
    },
    async resendVerification(values) {
      await invoke(
        '/auth/resend-verification',
        {
          baseUrl: options.baseUrl,
          method: 'POST',
          body: {
            email: values.email,
            password: values.password,
          },
          credentials: 'include',
        },
        fetcher,
      );
    },
    async refreshTokens() {
      const response = await invoke<AuthResponse>(
        '/auth/exchange-tokens',
        {
          baseUrl: options.baseUrl,
          method: 'POST',
          credentials: 'include',
        },
        fetcher,
      );
      return toAuthUser(response.user);
    },
  };
};

export const sessionClient = createSessionClient();
