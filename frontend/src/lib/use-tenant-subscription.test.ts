import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTenantSubscription } from './use-tenant-subscription';

// Mock auth context
const mockUser = { sub: 'u1', email: 'test@test.com', tenantId: 'T1', role: 'QualityManager', locale: 'en' };
vi.mock('./auth-context', () => ({
  useAuth: () => ({ user: mockUser, idToken: 'mock-token', isAuthenticated: true, isLoading: false, signIn: vi.fn(), signOut: vi.fn(), refreshLocale: vi.fn() }),
}));

// Mock fetchAuthSession
vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: vi.fn().mockResolvedValue({
    tokens: { idToken: { toString: () => 'fresh-token' } },
  }),
}));

// Track subscription behavior
let lastObserver: { next?: (v: unknown) => void; error?: (e: unknown) => void } | null = null;
let unsubscribeFn = vi.fn();

vi.mock('aws-amplify/api', () => ({
  generateClient: () => ({
    graphql: vi.fn().mockReturnValue({
      subscribe: (observer: { next?: (v: unknown) => void; error?: (e: unknown) => void }) => {
        lastObserver = observer;
        unsubscribeFn = vi.fn();
        return { unsubscribe: unsubscribeFn };
      },
    }),
  }),
}));

describe('useTenantSubscription', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    lastObserver = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes and receives data via observer.next', async () => {
    const onData = vi.fn();
    renderHook(() =>
      useTenantSubscription({
        query: 'subscription Test($tenantId: ID!) { onTest(tenantId: $tenantId) { id } }',
        onData,
      }),
    );

    // Wait for the async subscribe to resolve
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(lastObserver).not.toBeNull();

    // Simulate data delivery
    act(() => {
      lastObserver?.next?.({ data: { onTest: { id: '123' } } });
    });

    expect(onData).toHaveBeenCalledWith({ onTest: { id: '123' } });
  });

  it('calls unsubscribe on cleanup', async () => {
    const onData = vi.fn();
    const { unmount } = renderHook(() =>
      useTenantSubscription({
        query: 'subscription T($tenantId: ID!) { x(tenantId: $tenantId) { id } }',
        onData,
      }),
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    unmount();
    expect(unsubscribeFn).toHaveBeenCalled();
  });

  it('retries on error with exponential backoff', async () => {
    const onData = vi.fn();
    const onError = vi.fn();

    renderHook(() =>
      useTenantSubscription({
        query: 'subscription T($tenantId: ID!) { x(tenantId: $tenantId) { id } }',
        onData,
        onError,
      }),
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Simulate error
    act(() => {
      lastObserver?.error?.(new Error('connection lost'));
    });

    // Should retry after 1s (BASE_DELAY * 2^0)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    // After MAX_RETRIES errors, should call onError
    for (let i = 0; i < 5; i++) {
      act(() => {
        lastObserver?.error?.(new Error('still lost'));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BASE_DELAY_FOR_RETRY(i + 2));
      });
    }

    expect(onError).toHaveBeenCalled();
  });

  it('does not subscribe when enabled=false', async () => {
    const onData = vi.fn();
    renderHook(() =>
      useTenantSubscription({
        query: 'subscription T($tenantId: ID!) { x(tenantId: $tenantId) { id } }',
        onData,
        enabled: false,
      }),
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(lastObserver).toBeNull();
  });
});

function BASE_DELAY_FOR_RETRY(retryNum: number): number {
  return 1000 * Math.pow(2, retryNum - 1);
}
