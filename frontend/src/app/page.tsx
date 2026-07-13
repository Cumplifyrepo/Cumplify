'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

/**
 * Root page — redirects to /dashboard if authenticated, /sign-in otherwise.
 */
export default function Home() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      router.push(isAuthenticated ? '/dashboard' : '/sign-in');
    }
  }, [isAuthenticated, isLoading, router]);

  return null;
}
