'use client';

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  getCurrentUser,
  fetchAuthSession,
} from 'aws-amplify/auth';
import { useRouter } from 'next/navigation';
import type { AuthUser, AuthState } from './auth-types';

export type { AuthUser, AuthState } from './auth-types';

const AuthContext = createContext<AuthState | undefined>(undefined);

/**
 * Parse claims from the Cognito ID token JWT payload.
 * PreTokenGeneration stamps tenantId + role into the ID token only.
 */
function parseUserFromToken(payload: Record<string, unknown>): AuthUser {
  return {
    sub: (payload.sub as string) ?? '',
    email: (payload.email as string) ?? '',
    tenantId: (payload['custom:tenantId'] as string) ?? '',
    role: (payload['custom:role'] as string) ?? 'Employee',
    locale: (payload['custom:locale'] as string) ?? 'en',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Attempt to restore session on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await getCurrentUser();
        const session = await fetchAuthSession();
        const jwt = session.tokens?.idToken;
        if (jwt && !cancelled) {
          setIdToken(jwt.toString());
          setUser(parseUserFromToken(jwt.payload as Record<string, unknown>));
        }
      } catch {
        // Not authenticated
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      await amplifySignIn({ username: email, password });
      const session = await fetchAuthSession();
      const jwt = session.tokens?.idToken;
      if (jwt) {
        setIdToken(jwt.toString());
        setUser(parseUserFromToken(jwt.payload as Record<string, unknown>));
      }
      router.push('/dashboard');
    },
    [router],
  );

  const signOut = useCallback(async () => {
    await amplifySignOut();
    setUser(null);
    setIdToken(null);
    router.push('/sign-in');
  }, [router]);

  const refreshLocale = useCallback((locale: string) => {
    setUser((prev) => (prev ? { ...prev, locale } : null));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        idToken,
        signIn,
        signOut,
        refreshLocale,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
