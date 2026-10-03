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
  /** Best guess at signed-in state; uses a remembered hint until the session resolves. */
  likelySignedIn: boolean;
  signIn: UseMutationResult<AuthUser, AuthError, SignInValues>;
  signUp: UseMutationResult<AuthUser, AuthError, SignUpValues>;
  signOut: UseMutationResult<void, AuthError, void>;
}

const SIGNED_IN_HINT_KEY = 'classprints:signed-in';

const readSignedInHint = (): boolean => {
  try {
    return window.localStorage.getItem(SIGNED_IN_HINT_KEY) === '1';
  } catch {
    return false;
  }
};

const writeSignedInHint = (signedIn: boolean) => {
  try {
    if (signedIn) {
      window.localStorage.setItem(SIGNED_IN_HINT_KEY, '1');
    } else {
      window.localStorage.removeItem(SIGNED_IN_HINT_KEY);
    }
  } catch {
    // Storage unavailable; the hint is only a UI nicety.
  }
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const sessionClient = getAuthSessionClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [signedInHint] = useState(readSignedInHint);

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
        writeSignedInHint(nextUser !== null);
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
      likelySignedIn: initializing ? signedInHint : user !== null,
      signIn,
      signUp,
      signOut,
    }),
    [user, initializing, signedInHint, signIn, signUp, signOut],
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
