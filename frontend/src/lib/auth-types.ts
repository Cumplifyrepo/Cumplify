/**
 * Auth context types — extracted to .ts to avoid false-positive in the
 * hardcoded-strings checker (Promise<void> pattern triggers the JSX regex).
 */

export interface AuthUser {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
  locale: string;
}

export interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  idToken: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshLocale: (locale: string) => void;
}
