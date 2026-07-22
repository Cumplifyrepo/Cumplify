import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DocumentsPage from './page';

// ----- Mocks -----

const mockQuery = vi.fn();
const mockMutate = vi.fn();

vi.mock('@/lib/api', () => ({
  useGraphQL: () => ({ query: mockQuery, mutate: mockMutate }),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    user: { sub: 'u1', email: 't@t.com', tenantId: 'T1', role: 'QualityManager', locale: 'en' },
    isAuthenticated: true,
    isLoading: false,
    idToken: 'tok',
    signIn: vi.fn(),
    signOut: vi.fn(),
    refreshLocale: vi.fn(),
  }),
}));

vi.mock('@/lib/use-tenant-subscription', () => ({
  useTenantSubscription: () => undefined,
}));

vi.mock('@/lib/standard-scope', () => ({
  useStandardScope: () => ({ standard: '', isIMS: true }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => {
    const t = (key: string) => `${ns}.${key}`;
    t.has = () => true;
    return t;
  },
}));

vi.mock('@/components/studio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/studio')>();
  return {
    ...actual,
    AgentRunButton: ({
      label,
      mutation,
      variables,
      agentName,
      disabled,
    }: {
      label: string;
      mutation: string;
      variables?: Record<string, unknown>;
      agentName: string;
      disabled?: boolean;
    }) => (
      <button
        data-testid={`arb-${label}`}
        data-mutation={mutation}
        data-variables={JSON.stringify(variables ?? {})}
        data-agent={agentName}
        disabled={disabled}
      >
        {label}
      </button>
    ),
  };
});

vi.mock('@/components/controlled-doc', () => ({
  ControlledDocViewer: () => <div data-testid="doc-viewer" />,
}));

vi.mock('@/components/document-editor', () => ({
  DocumentEditor: () => <div data-testid="doc-editor" />,
}));

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (q: string) => {
    if (q.includes('ListDocs')) return { listDocuments: [] };
    throw new Error(`unmocked: ${q.slice(0, 40)}`);
  });
});

// ----- Tests -----

describe('Document Studio (S2)', () => {
  it('the front door IS DocStudio: intent textarea wires runDocDraft; empty-draft path demoted to secondary', async () => {
    render(<DocumentsPage />);
    await waitFor(() =>
      expect(screen.getByTestId('arb-docStudio.draftWithAgent')).toBeInTheDocument(),
    );

    const btn = screen.getByTestId('arb-docStudio.draftWithAgent');
    expect(btn).toHaveAttribute('data-agent', 'DocStudio');
    expect(btn.getAttribute('data-mutation')).toContain('runDocDraft');
    expect(btn).toBeDisabled(); // never dispatch an empty intent

    fireEvent.change(screen.getByPlaceholderText('docStudio.intentPlaceholder'), {
      target: { value: 'A procedure for controlling subcontractor site work' },
    });
    await waitFor(() =>
      expect(screen.getByTestId('arb-docStudio.draftWithAgent')).not.toBeDisabled(),
    );
    expect(JSON.parse(btn.getAttribute('data-variables')!)).toEqual({
      intent: 'A procedure for controlling subcontractor site work',
    });

    // Manual path demoted, still available
    expect(screen.getByText('docStudio.createManually')).toBeInTheDocument();
  });
});
