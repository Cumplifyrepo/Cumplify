'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { Amplify } from 'aws-amplify';
import { amplifyConfig } from './amplify-config';

/**
 * AmplifyProvider — configures Amplify exactly once on mount.
 * Static export (CON-3): safe for client-side-only initialization.
 */
export function AmplifyProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Amplify.configure(amplifyConfig);
    setReady(true);
  }, []);

  if (!ready) return null;

  return <>{children}</>;
}
