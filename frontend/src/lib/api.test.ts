import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// ----- Mocks -----

const { mockGraphql } = vi.hoisted(() => ({ mockGraphql: vi.fn() }));

vi.mock('aws-amplify/api', () => ({
  generateClient: () => ({ graphql: mockGraphql }),
}));

vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: vi.fn().mockResolvedValue({
    tokens: { idToken: { toString: () => 'tok' } },
  }),
}));

vi.mock('./auth-context', () => ({
  useAuth: () => ({ signOut: vi.fn() }),
}));

import { useGraphQL } from './api';

beforeEach(() => {
  mockGraphql.mockReset();
});

// ----- Tests -----

describe('useGraphQL error surfacing (S1 UI-witness fix)', () => {
  it('mutate: Amplify REJECTING with a GraphQLResult rethrows the first error MESSAGE — SoD/matrix rejections reach the card verbatim', async () => {
    // Amplify throws the result object itself on mutation errors — not an Error
    mockGraphql.mockRejectedValueOnce({
      data: { approveHitlItem: null },
      errors: [{ message: 'SoD violation: the proposer cannot approve their own item' }],
    });

    const { result } = renderHook(() => useGraphQL());
    await expect(result.current.mutate('mutation { x }')).rejects.toThrow(
      'SoD violation: the proposer cannot approve their own item',
    );
  });

  it('mutate: resolve-path errors array still throws the message (unchanged behavior)', async () => {
    mockGraphql.mockResolvedValueOnce({
      data: null,
      errors: [{ message: 'NC_NOT_FOUND' }],
    });

    const { result } = renderHook(() => useGraphQL());
    await expect(result.current.mutate('mutation { x }')).rejects.toThrow('NC_NOT_FOUND');
  });

  it('query: rejecting GraphQLResult rethrows the message too (symmetric)', async () => {
    mockGraphql.mockRejectedValueOnce({
      errors: [{ message: 'VERSION_NOT_FOUND' }],
    });

    const { result } = renderHook(() => useGraphQL());
    await expect(result.current.query('query { x }')).rejects.toThrow('VERSION_NOT_FOUND');
  });

  it('non-GraphQL rejections (network) pass through unchanged', async () => {
    mockGraphql.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useGraphQL());
    await expect(result.current.mutate('mutation { x }')).rejects.toThrow('Network error');
  });
});
