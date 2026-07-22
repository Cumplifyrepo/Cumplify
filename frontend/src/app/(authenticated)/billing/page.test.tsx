import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ----- Mocks -----

let mockRole = 'QualityManager';

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    user: { sub: 'u1', email: 'test@test.com', tenantId: 'T1', role: mockRole, locale: 'en' },
    isAuthenticated: true,
    isLoading: false,
    idToken: 'tok',
    signIn: vi.fn(),
    signOut: vi.fn(),
    refreshLocale: vi.fn(),
  }),
}));

vi.mock('next-intl', () => {
  const translations: Record<string, Record<string, string>> = {
    billing: {
      title: 'Billing',
      subscriptionTitle: 'Subscription & Payments',
      subscriptionDescription: 'Managed through Stripe.',
      openPortal: 'Open billing portal',
      portalNotConfigured: 'The billing portal is not configured.',
      usageTitle: 'AI Usage',
      usageDescription: 'Overage is billed, never blocked.',
    },
  };
  return {
    useTranslations: (ns: string) => {
      const t = (key: string) => translations[ns]?.[key] ?? `${ns}.${key}`;
      t.has = (key: string) => !!translations[ns]?.[key];
      return t;
    },
  };
});

vi.mock('@/components/shared', () => ({
  PageHeader: ({ title }: { title: string }) => <h1 data-testid="page-header">{title}</h1>,
  Panel: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <section data-testid={`panel-${title}`} aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));

// ----- Tests -----
// NEXT_PUBLIC_* is inlined at build time, but in vitest it reads process.env
// live — vi.stubEnv per test works because the module reads it at render
// via the const only once; import per-test after stubbing instead.

describe('BillingPage', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    mockRole = 'QualityManager';
  });

  it('renders the Stripe portal link from NEXT_PUBLIC_STRIPE_BILLING_PORTAL_URL, new tab + noopener', async () => {
    vi.stubEnv('NEXT_PUBLIC_STRIPE_BILLING_PORTAL_URL', 'https://billing.stripe.com/p/login/test_123');
    const { default: BillingPage } = await import('./page');
    render(<BillingPage />);

    const link = screen.getByRole('link', { name: 'Open billing portal' });
    expect(link).toHaveAttribute('href', 'https://billing.stripe.com/p/login/test_123');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    // Both panels present
    expect(screen.getByTestId('panel-Subscription & Payments')).toBeInTheDocument();
    expect(screen.getByTestId('panel-AI Usage')).toBeInTheDocument();
  });

  it('shows the not-configured state when the portal URL is absent — never a dead link', async () => {
    vi.stubEnv('NEXT_PUBLIC_STRIPE_BILLING_PORTAL_URL', '');
    const { default: BillingPage } = await import('./page');
    render(<BillingPage />);

    expect(screen.queryByRole('link', { name: 'Open billing portal' })).not.toBeInTheDocument();
    expect(screen.getByText('The billing portal is not configured.')).toBeInTheDocument();
  });

  it('renders nothing for non-admin roles (CON-6 presentation-only gate)', async () => {
    mockRole = 'Employee';
    vi.stubEnv('NEXT_PUBLIC_STRIPE_BILLING_PORTAL_URL', 'https://billing.stripe.com/p/login/test_123');
    const { default: BillingPage } = await import('./page');
    const { container } = render(<BillingPage />);

    expect(container).toBeEmptyDOMElement();
  });
});
