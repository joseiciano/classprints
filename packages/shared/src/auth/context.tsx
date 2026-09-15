import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { AuthUser, AuthSessionPersistPayload } from './types';

export interface AuthContextType {
  user: AuthUser | null;
  isSignedIn: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const checkAuthState = () => {
      try {
        const stored = localStorage.getItem('auth_session');
        if (stored) {
          const session: AuthSessionPersistPayload = JSON.parse(stored);
          if (session.idToken && session.user) {
            setUser(session.user);
          }
        }
      } catch (error) {
        console.error('Error checking auth state:', error);
        // Clear corrupted session
        localStorage.removeItem('auth_session');
      } finally {
        setLoading(false);
      }
    };

    checkAuthState();
  }, []);

  const isSignedIn = !!user;

  const signIn = async (email: string) => {
    setLoading(true);
    try {
      // TODO: Implement actual authentication logic
      // For now, mock successful sign in
      const mockUser: AuthUser = {
        id: 'mock-user-id',
        email,
        emailVerified: true,
        displayName: email.split('@')[0],
        emailNotificationsEnabledAt: null,
      };

      setUser(mockUser);

      const session: AuthSessionPersistPayload = {
        idToken: 'mock-id-token',
        refreshToken: 'mock-refresh-token',
        user: mockUser,
      };

      localStorage.setItem('auth_session', JSON.stringify(session));
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, _: string, displayName: string) => {
    setLoading(true);
    try {
      // TODO: Implement actual sign up logic
      // For now, mock successful sign up
      const mockUser: AuthUser = {
        id: 'mock-user-id',
        email,
        emailVerified: false,
        displayName,
        emailNotificationsEnabledAt: null,
      };

      setUser(mockUser);

      const session: AuthSessionPersistPayload = {
        idToken: 'mock-id-token',
        refreshToken: 'mock-refresh-token',
        user: mockUser,
      };

      localStorage.setItem('auth_session', JSON.stringify(session));
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      // TODO: Implement actual sign out logic
      setUser(null);
      localStorage.removeItem('auth_session');
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      setLoading(false);
    }
  };

  const value: AuthContextType = {
    user,
    isSignedIn,
    loading,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
