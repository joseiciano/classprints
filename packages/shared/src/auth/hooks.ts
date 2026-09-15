import { useCallback, useMemo } from 'react';
import {
  type UseMutationOptions,
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  AuthCopy,
  AuthUser,
  PasswordResetValues,
  SignInValues,
  SignUpValues,
  VerificationValues,
} from '@classprints/shared';
import { getAuthCopy } from './config';
import { authQueryKeys } from './query-keys';
import { createAuthActions, type AuthActionConfig } from './mutations';
import type { AuthError } from './errors';
import type { SessionClient } from '../http/session-client';

interface BaseOptions<TVariables, TData> extends UseMutationOptions<TData, AuthError, TVariables> {
  copy?: AuthCopy;
  sessionClient?: SessionClient;
}

type SignInOptions = BaseOptions<SignInValues, AuthUser> & Pick<AuthActionConfig, 'beforeSignIn'>;
type SignUpOptions = BaseOptions<SignUpValues, AuthUser> & Pick<AuthActionConfig, 'beforeSignUp'>;
type PasswordResetOptions = BaseOptions<PasswordResetValues, void>;
type VerificationOptions = BaseOptions<VerificationValues, void> &
  Pick<AuthActionConfig, 'onVerificationResent'>;
type SignOutOptions = BaseOptions<void, void>;

const useActions = (config: Partial<AuthActionConfig>) =>
  useMemo(
    () =>
      createAuthActions({
        copy: config.copy,
        sessionClient: config.sessionClient,
        beforeSignIn: config.beforeSignIn,
        beforeSignUp: config.beforeSignUp,
        onVerificationResent: config.onVerificationResent,
      }),
    [
      config.copy,
      config.sessionClient,
      config.beforeSignIn,
      config.beforeSignUp,
      config.onVerificationResent,
    ],
  );

export const useSignIn = (
  options: SignInOptions = {},
): UseMutationResult<AuthUser, AuthError, SignInValues> => {
  const queryClient = useQueryClient();
  const { onSuccess, onError, copy: optionCopy, sessionClient, beforeSignIn, ...rest } = options;

  const copy = optionCopy ?? getAuthCopy();
  const actions = useActions({
    copy,
    sessionClient,
    beforeSignIn,
  });

  return useMutation({
    ...rest,
    mutationKey: ['auth', 'signIn'],
    mutationFn: actions.signIn,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(authQueryKeys.session(), data);
      onSuccess?.(data, variables, context, mutation);
    },
    onError: (error, variables, context, mutation) => {
      onError?.(error, variables, context, mutation);
    },
  });
};

export const useSignUp = (
  options: SignUpOptions = {},
): UseMutationResult<AuthUser, AuthError, SignUpValues> => {
  const queryClient = useQueryClient();
  const { onSuccess, onError, copy: optionCopy, sessionClient, beforeSignUp, ...rest } = options;

  const copy = optionCopy ?? getAuthCopy();
  const actions = useActions({
    copy,
    sessionClient,
    beforeSignUp,
  });

  return useMutation({
    ...rest,
    mutationKey: ['auth', 'signUp'],
    mutationFn: actions.signUp,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(authQueryKeys.session(), data);
      onSuccess?.(data, variables, context, mutation);
    },
    onError: (error, variables, context, mutation) => {
      onError?.(error, variables, context, mutation);
    },
  });
};

export const useSignOut = (
  options: SignOutOptions = {},
): UseMutationResult<void, AuthError, void> => {
  const queryClient = useQueryClient();
  const { onSuccess, onError, copy: optionCopy, sessionClient, ...rest } = options;

  const copy = optionCopy ?? getAuthCopy();
  const actions = useActions({
    copy,
    sessionClient,
  });

  return useMutation({
    ...rest,
    mutationKey: ['auth', 'signOut'],
    mutationFn: actions.signOut,
    onSuccess: (data, variables, context, mutation) => {
      queryClient.setQueryData(authQueryKeys.session(), null);
      queryClient.invalidateQueries({ queryKey: authQueryKeys.session() });
      onSuccess?.(data, variables, context, mutation);
    },
    onError: (error, variables, context, mutation) => {
      onError?.(error, variables, context, mutation);
    },
  });
};

export const usePasswordReset = (
  options: PasswordResetOptions = {},
): UseMutationResult<void, AuthError, PasswordResetValues> => {
  const { onSuccess, onError, copy: optionCopy, sessionClient, ...rest } = options;

  const copy = optionCopy ?? getAuthCopy();
  const actions = useActions({
    copy,
    sessionClient,
  });

  return useMutation({
    ...rest,
    mutationKey: ['auth', 'passwordReset'],
    mutationFn: actions.sendPasswordReset,
    onSuccess: (data, variables, context, mutation) => {
      onSuccess?.(data, variables, context, mutation);
    },
    onError: (error, variables, context, mutation) => {
      onError?.(error, variables, context, mutation);
    },
  });
};

export const useResendVerification = (
  options: VerificationOptions = {},
): UseMutationResult<void, AuthError, VerificationValues> => {
  const {
    onSuccess,
    onError,
    copy: optionCopy,
    sessionClient,
    onVerificationResent,
    ...rest
  } = options;

  const copy = optionCopy ?? getAuthCopy();
  const actions = useActions({
    copy,
    sessionClient,
    onVerificationResent,
  });

  return useMutation({
    ...rest,
    mutationKey: ['auth', 'resendVerification'],
    mutationFn: actions.resendVerification,
    onSuccess: (data, variables, context, mutation) => {
      onSuccess?.(data, variables, context, mutation);
    },
    onError: (error, variables, context, mutation) => {
      onError?.(error, variables, context, mutation);
    },
  });
};

export interface UseSignOutHandlerOptions {
  onSuccess?: () => Promise<void> | void;
  onError?: (error: unknown) => void;
  onFinally?: () => void;
  preventConcurrent?: boolean;
}

export const useSignOutHandler = (
  signOut: UseMutationResult<void, AuthError, void>,
  options: UseSignOutHandlerOptions = {},
): (() => void) => {
  const { onSuccess, onError, onFinally, preventConcurrent = true } = options;

  return useCallback(() => {
    if (preventConcurrent && signOut.isPending) {
      return;
    }

    const run = async () => {
      try {
        await signOut.mutateAsync();
        await onSuccess?.();
      } catch (error) {
        onError?.(error);
        throw error;
      } finally {
        onFinally?.();
      }
    };

    void run();
  }, [onError, onFinally, onSuccess, preventConcurrent, signOut]);
};
