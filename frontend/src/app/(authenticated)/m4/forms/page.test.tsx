import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import FormsPage from './page';

// ----- Mocks -----

const mockQuery = vi.fn();
const mockMutate = vi.fn();

vi.mock('@/lib/api', () => ({
  useGraphQL: () => ({ query: mockQuery, mutate: mockMutate }),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    user: {
      sub: 'u1',
      email: 'test@test.com',
      tenantId: 'T1',
      role: 'QualityManager',
      locale: 'en',
    },
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
    forms: { 'tpl.ncr.title': 'NCR', 'tpl.ncr.desc': 'NCR desc' },
    'forms.catalog': {
      title: 'Form Templates',
      filterAll: 'All',
      loading: 'Loading...',
      sections: 'sections',
      fields: 'fields',
    },
    'forms.register': {
      colStatus: 'Status',
      colCompletion: 'Completion',
      colOpenedBy: 'Opened',
      colUpdated: 'Updated',
      newRecord: 'New',
      backToCatalog: 'Back',
      loading: 'Loading...',
      empty: 'No records',
    },
    'forms.form': {
      loading: 'Loading...',
      back: 'Back',
      submit: 'Submit',
      approve: 'Approve',
      reopen: 'Reopen',
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
  Panel: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <section data-testid={`panel-${title}`}>{children}</section>
  ),
  DataTable: ({
    data,
    columns,
  }: {
    data: unknown[];
    columns: { key: string; render: (item: unknown) => React.ReactNode }[];
  }) => (
    <table data-testid="data-table">
      <tbody>
        {data.map((item, i) => (
          <tr key={i}>
            {columns.map((c) => (
              <td key={c.key}>{c.render(item)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
  StatusBadge: ({ status }: { status: string }) => <span data-testid="badge">{status}</span>,
  PrimaryButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  SecondaryButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  ErrorState: ({ onRetry }: { onRetry: () => void }) => (
    <button onClick={onRetry}>retry-action</button>
  ),
  EmptyState: ({ message }: { message: string }) => <p>{message}</p>,
  ClauseChip: () => null,
  ProvenanceLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  FormDrawer: () => null,
}));

// ----- Fixtures -----

const mockTemplates = [
  {
    id: 'tpl-1',
    key: 'ncr',
    titleKey: 'forms.tpl.ncr.title',
    descriptionKey: 'forms.tpl.ncr.desc',
    category: 'corrective',
    clauseRefs: ['8.7', '10.2'],
    standards: ['ISO9001', 'ISO14001', 'ISO45001', 'IMS'],
    requiresApproval: true,
    sectionCount: 6,
    fieldCount: 35,
  },
  {
    id: 'tpl-2',
    key: 'hira',
    titleKey: 'forms.tpl.hira.title',
    descriptionKey: 'forms.tpl.hira.desc',
    category: 'ohs',
    clauseRefs: ['6.1.2'],
    standards: ['ISO45001', 'IMS'],
    requiresApproval: false,
    sectionCount: 3,
    fieldCount: 12,
  },
];

// ----- Tests -----

describe('FormsPage — Template Catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ listFormTemplates: mockTemplates });
  });

  it('renders catalog cards with sectionCount/fieldCount from API (BC-1: never client-computed)', async () => {
    render(<FormsPage />);

    await waitFor(() => {
      // sectionCount and fieldCount rendered from API response values
      expect(screen.getByText('6 sections')).toBeInTheDocument();
      expect(screen.getByText('35 fields')).toBeInTheDocument();
      expect(screen.getByText('3 sections')).toBeInTheDocument();
      expect(screen.getByText('12 fields')).toBeInTheDocument();
    });
  });

  it('chips render clause refs from API data', async () => {
    render(<FormsPage />);

    await waitFor(() => {
      expect(screen.getByText('8.7')).toBeInTheDocument();
      expect(screen.getByText('10.2')).toBeInTheDocument();
      expect(screen.getByText('6.1.2')).toBeInTheDocument();
    });
  });

  it('renders page header with catalog title', async () => {
    render(<FormsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('page-header')).toHaveTextContent('Form Templates');
    });
  });

  it('error state renders with retry on fetch failure', async () => {
    mockQuery.mockRejectedValue(new Error('Network error'));

    render(<FormsPage />);

    await waitFor(() => {
      expect(screen.getByText('retry-action')).toBeInTheDocument();
    });
  });
});
