'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AppShell } from '@/components/shell';
import { AskOverlay } from '@/components/ask';
import { StandardScopeProvider } from '@/lib/standard-scope';

/**
 * Authenticated layout — wraps all views in the AppShell.
 * Redirects to /sign-in if not authenticated.
 * AskOverlay provides the floating trigger on all views (§4, ASK-1).
 */
export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/sign-in');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}
      >
        <p style={{ color: 'var(--color-text-muted)' }}>...</p>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <StandardScopeProvider>
      <AppShell>{children}</AppShell>
      <AskOverlay />
    </StandardScopeProvider>
  );
}
