'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * StandardSwitch global scope context — pain #7 (tri-standard toggle).
 * Per ims-experience/view-designs.md §2.
 *
 * Persisted to localStorage. Views consume this to filter queries by standard
 * (wiring happens in P2+). IMS = integrated view showing all standards combined.
 */

export type StandardScope = 'ISO9001' | 'ISO14001' | 'ISO45001' | 'IMS';

const STORAGE_KEY = 'cumplify:standardScope';
const DEFAULT_SCOPE: StandardScope = 'IMS';

interface StandardScopeContextValue {
  standard: StandardScope;
  setStandard: (s: StandardScope) => void;
  /** Convenience: true when scope is IMS (integrated view). */
  isIMS: boolean;
}

const StandardScopeContext = createContext<StandardScopeContextValue>({
  standard: DEFAULT_SCOPE,
  setStandard: () => {},
  isIMS: true,
});

function readPersistedScope(): StandardScope {
  if (typeof window === 'undefined') return DEFAULT_SCOPE;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'ISO9001' || stored === 'ISO14001' || stored === 'ISO45001' || stored === 'IMS') {
    return stored;
  }
  return DEFAULT_SCOPE;
}

export function StandardScopeProvider({ children }: { children: ReactNode }) {
  const [standard, setStandardRaw] = useState<StandardScope>(DEFAULT_SCOPE);

  // Hydrate from localStorage on mount (avoids SSR mismatch with static export).
  useEffect(() => {
    setStandardRaw(readPersistedScope());
  }, []);

  const setStandard = useCallback((s: StandardScope) => {
    setStandardRaw(s);
    localStorage.setItem(STORAGE_KEY, s);
  }, []);

  const isIMS = standard === 'IMS';

  return (
    <StandardScopeContext.Provider value={{ standard, setStandard, isIMS }}>
      {children}
    </StandardScopeContext.Provider>
  );
}

export function useStandardScope(): StandardScopeContextValue {
  return useContext(StandardScopeContext);
}
