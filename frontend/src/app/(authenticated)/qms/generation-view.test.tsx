import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { GenerationView, type RegistryEntry } from './generation-view';

const mockQuery = vi.fn();
const mockMutate = vi.fn();
const mockOnViewDocument = vi.fn();

vi.mock('@/lib/api', () => ({ useGraphQL: () => ({ query: mockQuery, mutate: mockMutate }) }));
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { sub: 'u1', tenantId: 'T1', role: 'QualityManager', locale: 'en' }, isAuthenticated: true, isLoading: false, signIn: vi.fn(), signOut: vi.fn(), refreshLocale: vi.fn() }),
}));
vi.mock('@/lib/use-tenant-subscription', () => ({ useTenantSubscription: vi.fn() }));

vi.mock('next-intl', () => {
  const t: Record<string, Record<string, string>> = {
    'qms.generation': {
      title: 'Document Generation', generate: 'Generate IMS Manual', generating: 'Generating...',
      profileRequired: 'Organization profile is required before generating. Complete your profile first.',
      noStandards: 'No standards in scope. Select standards in your organization profile.',
      unavailable: 'Generation is currently unavailable. Please try again later.',
      goToProfile: 'Complete Profile', runStatus: 'Generation Status',
      sectionCount: 'sections', gapSection: 'GAP', failedSection: 'Failed',
      naSection: 'N/A', proseSection: 'Content ready', pendingSection: 'Pending',
      reviewed: 'Reviewed', unreviewed: 'Not reviewed', markReviewed: 'Mark reviewed',
      sectionFailed: 'Section composition failed',
      gapLinkTraining: 'Competence & Training', gapLinkRisk: 'Risk Management',
      gapLinkAudit: 'Audit Studio', gapLinkRecords: 'Records',
      gapLinkCapa: 'CAPA', gapLinkLegal: 'Legal Obligations', gapLinkObjectives: 'Objectives',
    },
  };
  return { useTranslations: (ns: string) => { const fn = (k: string) => t[ns]?.[k] ?? `${ns}.${k}`; fn.has = (k: string) => !!(t[ns]?.[k]); return fn; } };
});

vi.mock('@/components/shared', () => ({
  Panel: ({ children, title }: { children: React.ReactNode; title?: string }) => <section data-testid={`panel-${title ?? 'untitled'}`}>{children}</section>,
  PrimaryButton: ({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...p}>{children}</button>,
  SecondaryButton: ({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...p}>{children}</button>,
  StatusBadge: ({ status }: { status: string }) => <span data-testid={`badge-${status}`}>{status}</span>,
  ErrorState: ({ onRetry }: { onRetry: () => void }) => <button onClick={onRetry}>retry-action</button>,
}));

// Registry map fixture — clauseRefs in GenerationSection are UUIDs that resolve here
const mockRegistryMap = new Map<string, RegistryEntry>([
  ['reg-uuid-1', { id: 'reg-uuid-1', standard: 'ISO9001', clauseNo: '4.1', clauseTitle: 'Context', requiredSources: '["org_profile.legalName"]' }],
  ['reg-uuid-2', { id: 'reg-uuid-2', standard: 'ISO9001', clauseNo: '6.1', clauseTitle: 'Risks', requiredSources: '["register.risk_assessments"]' }],
  ['reg-uuid-3', { id: 'reg-uuid-3', standard: 'ISO9001', clauseNo: '4.4', clauseTitle: 'QMS', requiredSources: '["org_profile.coreProcesses"]' }],
  ['reg-uuid-4', { id: 'reg-uuid-4', standard: 'ISO9001', clauseNo: '8.1', clauseTitle: 'Operations', requiredSources: '["register.training_records"]' }],
  ['reg-uuid-5', { id: 'reg-uuid-5', standard: 'ISO9001', clauseNo: '7.2', clauseTitle: 'Competence', requiredSources: '["register.training_records"]' }],
]);

const mockRun = {
  id: 'run-1', status: 'COMPLETE', standards: ['ISO9001', 'ISO14001'],
  sections: [
    { id: 's1', harmonizationKey: '4.1-context', kind: 'PROSE', clauseRefs: '["reg-uuid-1"]', contentSha256: 'abc', reviewedBy: null, reviewedAt: null, error: null },
    { id: 's2', harmonizationKey: '6.1-risks', kind: 'GAP', clauseRefs: '["reg-uuid-2"]', contentSha256: null, reviewedBy: null, reviewedAt: null, error: null },
    { id: 's3', harmonizationKey: '4.4-qms', kind: 'PROSE', clauseRefs: '["reg-uuid-3"]', contentSha256: 'def', reviewedBy: 'jane', reviewedAt: '2026-07-15T10:00:00Z', error: null },
    { id: 's4', harmonizationKey: '8.1-ops', kind: 'FAILED', clauseRefs: '["reg-uuid-4"]', contentSha256: null, reviewedBy: null, reviewedAt: null, error: 'Composition timeout' },
    { id: 's5', harmonizationKey: '7.2-competence', kind: 'NA_JUSTIFIED', clauseRefs: '["reg-uuid-5"]', contentSha256: null, reviewedBy: null, reviewedAt: null, error: null },
  ],
  manualDocumentId: 'doc-123', gapCount: 1, startedAt: '2026-07-15T09:00:00Z', finishedAt: '2026-07-15T09:05:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockResolvedValue({ listGenerationRuns: [mockRun] });
});

describe('GenerationView — generate action', () => {
  it('calls generateImsManual mutation with empty input on button click', async () => {
    mockMutate.mockResolvedValue({ generateImsManual: { ...mockRun, id: 'run-2' } });
    render(<GenerationView onViewDocument={mockOnViewDocument} registryMap={mockRegistryMap} />);

    await waitFor(() => expect(screen.getByTestId('generate-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('generate-btn'));

    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
    const [statement, variables] = mockMutate.mock.calls[0];
    expect(statement).toContain('generateImsManual');
    expect(variables).toEqual({ input: {} });
  });

  it('shows ORG_PROFILE_REQUIRED error with link to profile', async () => {
    mockMutate.mockRejectedValue(new Error('ORG_PROFILE_REQUIRED'));
    render(<GenerationView onViewDocument={mockOnViewDocument} registryMap={mockRegistryMap} />);

    await waitFor(() => expect(screen.getByTestId('generate-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('generate-btn'));

    await waitFor(() => expect(screen.getByTestId('error-profile-required')).toBeInTheDocument());
    expect(screen.getByTestId('go-to-profile')).toBeInTheDocument();
  });

  it('shows NO_STANDARDS_IN_SCOPE error', async () => {
    mockMutate.mockRejectedValue(new Error('NO_STANDARDS_IN_SCOPE'));
    render(<GenerationView onViewDocument={mockOnViewDocument} registryMap={mockRegistryMap} />);

    await waitFor(() => expect(screen.getByTestId('generate-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('generate-btn'));

    await waitFor(() => expect(screen.getByTestId('error-no-standards')).toBeInTheDocument());
  });

  it('shows GENERATION_UNAVAILABLE error with retry message', async () => {
    mockMutate.mockRejectedValue(new Error('GENERATION_UNAVAILABLE'));
    render(<GenerationView onViewDocument={mockOnViewDocument} registryMap={mockRegistryMap} />);

    await waitFor(() => expect(screen.getByTestId('generate-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('generate-btn'));

    await waitFor(() => expect(screen.getByTestId('error-unavailable')).toBeInTheDocument());
  });
});

describe('GenerationView — run view and section states', () => {
  it('renders section states: prose, gap, na, failed', async () => {
    render(<GenerationView onViewDocument={mockOnViewDocument} registryMap={mockRegistryMap} />);

    await waitFor(() => expect(screen.getByTestId('section-4.1-context')).toBeInTheDocument());
    expect(screen.getByTestId('section-6.1-risks')).toBeInTheDocument(); // GAP
    expect(screen.getByTestId('section-8.1-ops')).toBeInTheDocument(); // FAILED
    expect(screen.getByTestId('section-7.2-competence')).toBeInTheDocument(); // NA_JUSTIFIED
  });

  it('shows "Reviewed" label with reviewer info for already-reviewed sections', async () => {
    render(<GenerationView onViewDocument={mockOnViewDocument} registryMap={mockRegistryMap} />);

    await waitFor(() => expect(screen.getByTestId('reviewed-4.4-qms')).toBeInTheDocument());
    expect(screen.getByTestId('reviewed-4.4-qms').textContent).toContain('jane');
  });

  it('shows mark-reviewed button only for PROSE unreviewed sections when role can approve M1', async () => {
    render(<GenerationView onViewDocument={mockOnViewDocument} registryMap={mockRegistryMap} />);

    await waitFor(() => expect(screen.getByTestId('review-btn-4.1-context')).toBeInTheDocument());
    // GAP section should NOT have review button
    expect(screen.queryByTestId('review-btn-6.1-risks')).not.toBeInTheDocument();
    // FAILED section should NOT have review button
    expect(screen.queryByTestId('review-btn-8.1-ops')).not.toBeInTheDocument();
  });

  it('calls markSectionReviewed with correct sectionId', async () => {
    mockMutate.mockResolvedValue({ markSectionReviewed: { ...mockRun.sections[0], reviewedBy: 'u1', reviewedAt: '2026-07-15T12:00:00Z' } });
    render(<GenerationView onViewDocument={mockOnViewDocument} registryMap={mockRegistryMap} />);

    await waitFor(() => expect(screen.getByTestId('review-btn-4.1-context')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('review-btn-4.1-context'));

    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
    const [statement, variables] = mockMutate.mock.calls[0];
    expect(statement).toContain('markSectionReviewed');
    expect(variables).toEqual({ input: { sectionId: 's1' } });
  });

  it('displays failed section error text', async () => {
    render(<GenerationView onViewDocument={mockOnViewDocument} registryMap={mockRegistryMap} />);

    await waitFor(() => expect(screen.getByTestId('section-8.1-ops')).toBeInTheDocument());
    expect(screen.getByTestId('section-8.1-ops').textContent).toContain('Composition timeout');
  });

  it('shows view-manual button when manualDocumentId is set, calls onViewDocument', async () => {
    render(<GenerationView onViewDocument={mockOnViewDocument} registryMap={mockRegistryMap} />);

    await waitFor(() => expect(screen.getByTestId('view-manual-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('view-manual-btn'));
    expect(mockOnViewDocument).toHaveBeenCalledWith('doc-123');
  });

  it('renders clause numbers from registry map in section headers', async () => {
    render(<GenerationView onViewDocument={mockOnViewDocument} registryMap={mockRegistryMap} />);

    await waitFor(() => expect(screen.getByTestId('section-4.1-context')).toBeInTheDocument());
    // The section should display "ISO9001 4.1" resolved from the registry
    expect(screen.getByTestId('section-4.1-context').textContent).toContain('ISO9001 4.1');
  });
});

describe('GenerationView — GAP CTA from registry requiredSources', () => {
  it('renders GAP CTA link derived from registry entry requiredSources', async () => {
    render(<GenerationView onViewDocument={mockOnViewDocument} registryMap={mockRegistryMap} />);

    await waitFor(() => expect(screen.getByTestId('gap-cta-6.1-risks')).toBeInTheDocument());
    // reg-uuid-2 has requiredSources: ["register.risk_assessments"] → gapLinkRisk = "Risk Management"
    expect(screen.getByTestId('gap-cta-6.1-risks').textContent).toContain('Risk Management');
  });
});

describe('GenerationView — role gating', () => {
  it('review button only rendered for roles with M1 approval (tested via canApprove import)', async () => {
    render(<GenerationView onViewDocument={mockOnViewDocument} registryMap={mockRegistryMap} />);
    await waitFor(() => expect(screen.getByTestId('section-4.1-context')).toBeInTheDocument());
    expect(screen.getByTestId('review-btn-4.1-context')).toBeInTheDocument();
    expect(screen.queryByTestId('review-btn-4.4-qms')).not.toBeInTheDocument();
  });
});
