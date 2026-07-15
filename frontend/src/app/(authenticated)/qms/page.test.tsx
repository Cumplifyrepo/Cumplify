import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import QmsPage from './page';

const mockQuery = vi.fn();
const mockMutate = vi.fn();

vi.mock('@/lib/api', () => ({ useGraphQL: () => ({ query: mockQuery, mutate: mockMutate }) }));
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { sub: 'u1', tenantId: 'T1', role: 'QualityManager', locale: 'en' }, isAuthenticated: true, isLoading: false, signIn: vi.fn(), signOut: vi.fn(), refreshLocale: vi.fn() }),
}));

vi.mock('next-intl', () => {
  const t: Record<string, Record<string, string>> = {
    qms: { title: 'QMS', tabWizard: 'Profile', tabRegistry: 'Registry' },
    'qms.wizard': { title: 'Org Profile', loading: 'Loading...', legalName: 'Legal Name', industry: 'Industry', productsServices: 'Products', employeeCount: 'Employees', managementRep: 'Rep', standardsInScope: 'Standards', designResponsibility: 'Design', coreProcesses: 'Processes', siteName: 'Site', save: 'Save', saving: 'Saving', targetCertDate: 'Cert Date', stepBasic: 'Basic', stepSites: 'Sites', stepScope: 'Scope', prev: 'Prev', next: 'Next', yearFounded: 'Year', supplyChainShape: 'Supply Chain', existingCertifications: 'Certs', manualExists: 'Manual?', outsourcedProcesses: 'Outsourced', siteAddress: 'Address', siteCity: 'City', siteState: 'State', siteCountry: 'Country', siteHeadcount: 'Headcount', addSite: 'Add Site', removeSite: 'Remove' },
    'qms.registry': { loading: 'Loading...', namedGaps: 'Missing evidence', requiresRegisterData: 'Requires {register} data', naJustified: 'N/A justified', markApplicable: 'Applicable', markExcluded: 'Exclude', justificationPlaceholder: 'Justify', showAll: 'Show all' },
  };
  return { useTranslations: (ns: string) => { const fn = (k: string) => t[ns]?.[k] ?? `${ns}.${k}`; fn.has = (k: string) => !!(t[ns]?.[k]); return fn; } };
});

vi.mock('@/components/shared', () => ({
  PageHeader: ({ title }: { title: string }) => <h1 data-testid="header">{title}</h1>,
  Panel: ({ children, title }: { children: React.ReactNode; title?: string }) => <section data-testid={`panel-${title}`}>{children}</section>,
  PrimaryButton: ({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...p}>{children}</button>,
  SecondaryButton: ({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...p}>{children}</button>,
  ErrorState: ({ onRetry }: { onRetry: () => void }) => <button onClick={onRetry}>retry-action</button>,
}));

const mockClauses = [
  { id: 'c-1', standard: 'ISO9001', clauseNo: '4.1', clauseTitle: 'Context', intentParaphrase: 'Understand context', requiredSources: '["org_profile.legalName","org_profile.industry"]', sortOrder: 1 },
  { id: 'c-2', standard: 'ISO9001', clauseNo: '7.2', clauseTitle: 'Competence', intentParaphrase: 'Ensure competence', requiredSources: '["register.training_records"]', sortOrder: 2 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockImplementation((q: string) => {
    if (q.includes('getOrgProfile')) return Promise.resolve({ getOrgProfile: { payload: JSON.stringify({ legalName: 'Acme', sites: [{ name: 'HQ' }], employeeCount: 50, industry: 'Manufacturing', productsServices: 'Widgets', coreProcesses: ['assembly'], designResponsibility: false, standardsInScope: ['ISO9001'], managementRep: 'Jane' }) } });
    if (q.includes('listClauseRegistry')) return Promise.resolve({ listClauseRegistry: mockClauses });
    if (q.includes('listClauseApplicability')) return Promise.resolve({ listClauseApplicability: [] });
    return Promise.resolve({});
  });
});

describe('QMS Wizard — ORG-1 fields', () => {
  it('renders multi-step wizard with step tabs', async () => {
    render(<QmsPage />);
    await waitFor(() => expect(screen.getByText('Basic')).toBeInTheDocument());
    expect(screen.getByText('Sites')).toBeInTheDocument();
    expect(screen.getByText('Scope')).toBeInTheDocument();
  });
});

describe('QMS Registry — ORG-4: exclude button disabled without justification', () => {
  it('exclude button is disabled when justification is empty, enabled after typing', async () => {
    render(<QmsPage />);
    // Switch to registry tab
    fireEvent.click(screen.getByText('Registry'));

    await waitFor(() => expect(screen.getByTestId('clause-4.1')).toBeInTheDocument());

    // Exclude button should be disabled (no justification typed)
    const excludeBtn = screen.getByTestId('exclude-btn-4.1') as HTMLButtonElement;
    expect(excludeBtn.disabled).toBe(true);

    // Type a justification
    const justInput = screen.getByTestId('justification-4.1');
    fireEvent.change(justInput, { target: { value: 'Not relevant to our scope' } });

    // Now the button should be enabled
    expect(excludeBtn.disabled).toBe(false);
  });
});

describe('QMS Registry — ORG-3: named gaps computed from loaded profile', () => {
  it('shows named gap when profile field is missing (industry filled, but clause needing missing field shows gap)', async () => {
    // Profile has legalName + industry filled, so clause 4.1 (needs org_profile.legalName + org_profile.industry) has NO gaps
    // But clause 7.2 needs register.training_records → shows "requires register data"
    render(<QmsPage />);
    fireEvent.click(screen.getByText('Registry'));

    await waitFor(() => expect(screen.getByTestId('clause-7.2')).toBeInTheDocument());

    // Clause 7.2 shows a gap for register source
    const gapsEl = screen.getByTestId('gaps-7.2');
    expect(gapsEl).toBeInTheDocument();
    expect(gapsEl.textContent).toContain('training_records');
  });

  it('does NOT show gaps for profile fields that ARE filled', async () => {
    render(<QmsPage />);
    fireEvent.click(screen.getByText('Registry'));

    await waitFor(() => expect(screen.getByTestId('clause-4.1')).toBeInTheDocument());

    // Clause 4.1 needs org_profile.legalName + org_profile.industry — both filled → no gap
    expect(screen.queryByTestId('gaps-4.1')).not.toBeInTheDocument();
  });
});
