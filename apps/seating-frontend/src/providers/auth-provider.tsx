import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { AuthUser, SignInValues, SignUpValues } from '@classprints/shared';
import {
  subscribeToAuthState,
  useSignIn,
  useSignOut,
  useSignUp,
  type AuthError,
} from '@classprints/shared/auth';
import { getAuthSessionClient } from '../lib/auth-client';

interface AuthContextValue {
  user: AuthUser | null;
  initializing: boolean;
  signIn: UseMutationResult<AuthUser, AuthError, SignInValues>;
  signUp: UseMutationResult<AuthUser, AuthError, SignUpValues>;
  signOut: UseMutationResult<void, AuthError, void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const sessionClient = getAuthSessionClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initializing, setInitializing] = useState(true);

  const signIn = useSignIn({ sessionClient });
  const signUp = useSignUp({ sessionClient });
  const signOut = useSignOut({ sessionClient });

  useEffect(() => {
    let resolved = false;

    const unsubscribe = subscribeToAuthState({
      queryClient,
      sessionClient,
      enableProactiveRefresh: true,
      refreshConfig: {
        refreshBeforeExpiryMs: 45 * 60 * 1000,
        tokenLifetimeMs: 60 * 60 * 1000,
      },
      onUserChanged: (nextUser) => {
        setUser(nextUser);
        if (!resolved) {
          resolved = true;
          setInitializing(false);
        }
      },
    });

    return () => {
      resolved = true;
      unsubscribe();
    };
  }, [queryClient, sessionClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initializing,
      signIn,
      signUp,
      signOut,
    }),
    [user, initializing, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
