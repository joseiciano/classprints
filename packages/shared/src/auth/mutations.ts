import {
  type AuthCopy,
  type AuthUser,
  type PasswordResetValues,
  type SignInValues,
  type SignUpValues,
  type VerificationValues,
} from '@classprints/shared';
import { toAuthError, type AuthError } from './errors';
import {
  createSessionClient,
  sessionClient as defaultSessionClient,
  type SessionClient,
} from '../http/session-client';
import { getAuthCopy } from './config';

export interface AuthActions {
  signIn(values: SignInValues): Promise<AuthUser>;
  signUp(values: SignUpValues): Promise<AuthUser>;
  signOut(): Promise<void>;
  sendPasswordReset(values: PasswordResetValues): Promise<void>;
  resendVerification(values: VerificationValues): Promise<void>;
}

export interface AuthActionConfig {
  copy?: AuthCopy;
  sessionClient?: SessionClient;
  beforeSignIn?: (values: SignInValues) => Promise<void> | void;
  beforeSignUp?: (values: SignUpValues) => Promise<void> | void;
  onVerificationResent?: (email: string) => Promise<void> | void;
}

const normalizeRemember = (remember?: boolean) => remember ?? true;

export const createAuthActions = (config: AuthActionConfig = {}): AuthActions => {
  const copy = config.copy ?? getAuthCopy();
  const session = config.sessionClient ?? defaultSessionClient ?? createSessionClient();
  const handleError = (error: unknown): AuthError => toAuthError(error, copy);

  return {
    async signIn(values) {
      try {
        await config.beforeSignIn?.(values);
        const result = await session.signIn({
          ...values,
          remember: normalizeRemember(values.remember),
        });
        return result;
      } catch (error) {
        throw handleError(error);
      }
    },
    async signUp(values) {
      try {
        await config.beforeSignUp?.(values);
        const result = await session.signUp({
          ...values,
          remember: normalizeRemember(values.remember),
        });
        return result;
      } catch (error) {
        throw handleError(error);
      }
    },
    async signOut() {
      try {
        await session.signOut();
      } catch (error) {
        throw handleError(error);
      }
    },
    async sendPasswordReset(values) {
      try {
        await session.requestPasswordReset(values);
      } catch (error) {
        throw handleError(error);
      }
    },
    async resendVerification(values) {
      try {
        await session.resendVerification(values);
        await config.onVerificationResent?.(values.email);
      } catch (error) {
        throw handleError(error);
      }
    },
  };
};
