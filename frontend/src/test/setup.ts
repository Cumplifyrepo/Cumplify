import '@testing-library/jest-dom/vitest';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => ({
    $$typeof: Symbol.for('react.element'),
    type: 'img',
    props,
    key: null,
    ref: null,
  }),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, ...props }: { children: React.ReactNode; href: string }) => {
    return {
      $$typeof: Symbol.for('react.element'),
      type: 'a',
      props: { ...props, children },
      key: null,
      ref: null,
    };
  },
}));

// Mock aws-amplify/auth — HERMETIC: any unmocked call throws
vi.mock('aws-amplify/auth', () => ({
  signIn: vi.fn().mockRejectedValue(new Error('UNMOCKED signIn')),
  signOut: vi.fn().mockResolvedValue(undefined),
  getCurrentUser: vi.fn().mockRejectedValue(new Error('Not authenticated')),
  fetchAuthSession: vi.fn().mockResolvedValue({
    tokens: {
      idToken: {
        toString: () => 'mock-id-token',
        payload: {
          sub: 'user-123',
          email: 'test@cumplify.ai',
          'custom:tenantId': 'tenant-001',
          'custom:role': 'QualityManager',
          'custom:locale': 'en',
        },
      },
    },
  }),
}));

// Mock aws-amplify/api — HERMETIC
vi.mock('aws-amplify/api', () => ({
  generateClient: () => ({
    graphql: vi.fn().mockRejectedValue(new Error('UNMOCKED graphql call')),
  }),
}));

// Mock aws-amplify
vi.mock('aws-amplify', () => ({
  Amplify: {
    configure: vi.fn(),
  },
}));
