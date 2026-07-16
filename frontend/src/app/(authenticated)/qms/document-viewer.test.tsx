import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { DocumentViewer } from './document-viewer';

const mockQuery = vi.fn();
const mockMutate = vi.fn();
const mockOnBack = vi.fn();
const mockOnDiff = vi.fn();

vi.mock('@/lib/api', () => ({ useGraphQL: () => ({ query: mockQuery, mutate: mockMutate }) }));
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    user: { sub: 'u1', tenantId: 'T1', role: 'QualityManager', locale: 'en' },
    isAuthenticated: true,
    isLoading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refreshLocale: vi.fn(),
  }),
}));

vi.mock('next-intl', () => {
  const t: Record<string, Record<string, string>> = {
    'qms.docViewer': {
      title: 'Document Viewer',
      versions: 'Version History',
      diffTitle: 'Version Diff',
      diffUnavailable: 'Diff unavailable for this version',
      noVersions: 'Single version — no diff available',
      additions: 'additions',
      deletions: 'deletions',
      kindChange: 'Section type changed',
      selectVersions: 'Select two versions to compare',
      back: 'Back',
      unresolvedGaps: 'Unresolved gap sections remain',
      sodViolation: 'Segregation of duties violation: approver cannot be the author',
      export: 'Export',
      exportBlocked: 'Export not yet available (awaiting backend)',
      submitForApproval: 'Submit for approval',
      unreviewedSections:
        'Not all sections have been reviewed. Review all prose sections before submitting.',
      submitSuccess: 'Document submitted for approval successfully.',
      versionLabel: 'Version {version}',
      selectVersionForDiff: 'Select version {version} for diff comparison',
    },
    'qms.generation': {
      gapSection: 'GAP',
      failedSection: 'Failed',
      naSection: 'N/A',
      proseSection: 'Content ready',
      reviewed: 'Reviewed',
      unreviewed: 'Not reviewed',
      markReviewed: 'Mark reviewed',
    },
  };
  return {
    useTranslations: (ns: string) => {
      const fn = (k: string) => t[ns]?.[k] ?? `${ns}.${k}`;
      fn.has = (k: string) => !!t[ns]?.[k];
      return fn;
    },
  };
});

vi.mock('@/components/shared', () => ({
  PrimaryButton: ({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...p}>{children}</button>
  ),
  SecondaryButton: ({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...p}>{children}</button>
  ),
  StatusBadge: ({ status }: { status: string }) => (
    <span data-testid={`badge-${status}`}>{status}</span>
  ),
  ErrorState: ({ onRetry }: { onRetry: () => void }) => (
    <button onClick={onRetry}>retry-action</button>
  ),
}));

const mockVersions = [
  {
    id: 'v1',
    documentId: 'doc-1',
    versionNo: 1,
    contentRef: 's3://bucket/key',
    changeSummary: 'Initial',
    authorId: 'u1',
    createdAt: '2026-07-15T09:00:00Z',
  },
];

// Real derive.ts content shape (verbatim from assembleManualContent)
const mockContent = JSON.stringify({
  schemaVersion: 1,
  documentId: 'doc-1',
  versionNo: 1,
  locale: 'en',
  frontMatter: {
    purpose:
      'This manual was generated from the organization\u2019s own recorded data. Where required information was absent, the affected section is shown as an explicit gap.',
    scope: {
      organization: 'Acme Corp',
      standards: ['ISO9001', 'ISO14001'],
      sites: ['HQ, City, Country'],
      managementRepresentative: 'Jane',
    },
    normativeRefs: [
      { standard: 'ISO9001', source: 'https://www.iso.org/store.html' },
      { standard: 'ISO14001', source: 'https://www.iso.org/store.html' },
    ],
    terms: [],
  },
  sections: [
    {
      harmonizationKey: '4.1-context',
      clauseRefs: [{ standard: 'ISO9001', clauseNo: '4.1' }],
      kind: 'prose',
      sentences: [
        { text: 'The organization has determined external and internal issues.', factRefs: ['F1'] },
      ],
    },
    {
      harmonizationKey: '6.1-risks',
      clauseRefs: [{ standard: 'ISO9001', clauseNo: '6.1' }],
      kind: 'gap',
      gap: { missingSources: ['register.risk_assessments', 'register.aspects_register'] },
    },
    {
      harmonizationKey: '7.2-competence',
      clauseRefs: [{ standard: 'ISO9001', clauseNo: '7.2' }],
      kind: 'na_justified',
      naJustification: 'Design not in scope',
    },
    {
      harmonizationKey: '8.1-ops',
      clauseRefs: [{ standard: 'ISO9001', clauseNo: '8.1' }],
      kind: 'failed',
      failed: true,
    },
  ],
});

// Run sections for review state join
const mockRunSections = [
  { id: 's1', harmonizationKey: '4.1-context', kind: 'PROSE', reviewedBy: null, reviewedAt: null },
  { id: 's2', harmonizationKey: '6.1-risks', kind: 'GAP', reviewedBy: null, reviewedAt: null },
  {
    id: 's3',
    harmonizationKey: '7.2-competence',
    kind: 'NA_JUSTIFIED',
    reviewedBy: null,
    reviewedAt: null,
  },
  { id: 's4', harmonizationKey: '8.1-ops', kind: 'FAILED', reviewedBy: null, reviewedAt: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockImplementation((q: string) => {
    if (q.includes('listDocumentVersions'))
      return Promise.resolve({ listDocumentVersions: mockVersions });
    if (q.includes('getDocumentContent'))
      return Promise.resolve({ getDocumentContent: mockContent });
    if (q.includes('listGenerationRuns'))
      return Promise.resolve({
        listGenerationRuns: [{ manualDocumentId: 'doc-1', sections: mockRunSections }],
      });
    return Promise.resolve({});
  });
});

describe('DocumentViewer — content rendering (derive.ts contract)', () => {
  it('renders BC-1 disclaimer from frontMatter.purpose', async () => {
    render(<DocumentViewer documentId="doc-1" onBack={mockOnBack} onDiff={mockOnDiff} />);

    await waitFor(() => expect(screen.getByTestId('bc1-disclaimer')).toBeInTheDocument());
    expect(screen.getByTestId('bc1-disclaimer').textContent).toContain(
      'generated from the organization',
    );
  });

  it('renders ISO store link from normativeRefs[0].source', async () => {
    render(<DocumentViewer documentId="doc-1" onBack={mockOnBack} onDiff={mockOnDiff} />);

    await waitFor(() => expect(screen.getByTestId('bc1-disclaimer')).toBeInTheDocument());
    expect(screen.getByTestId('bc1-disclaimer').querySelector('a')?.href).toBe(
      'https://www.iso.org/store.html',
    );
  });

  it('renders prose sections with sentence text', async () => {
    render(<DocumentViewer documentId="doc-1" onBack={mockOnBack} onDiff={mockOnDiff} />);

    await waitFor(() => expect(screen.getByTestId('doc-section-4.1-context')).toBeInTheDocument());
    expect(screen.getByTestId('doc-section-4.1-context').textContent).toContain(
      'external and internal issues',
    );
  });

  it('renders clauseRefs as "standard clauseNo" (not [object Object])', async () => {
    render(<DocumentViewer documentId="doc-1" onBack={mockOnBack} onDiff={mockOnDiff} />);

    await waitFor(() => expect(screen.getByTestId('doc-section-4.1-context')).toBeInTheDocument());
    expect(screen.getByTestId('doc-section-4.1-context').textContent).toContain('ISO9001 4.1');
  });

  it('renders GAP blocks with missingSources (no sentences, visually distinct)', async () => {
    render(<DocumentViewer documentId="doc-1" onBack={mockOnBack} onDiff={mockOnDiff} />);

    await waitFor(() => expect(screen.getByTestId('gap-block-6.1-risks')).toBeInTheDocument());
    expect(screen.getByTestId('gap-block-6.1-risks').textContent).toContain(
      'register.risk_assessments',
    );
    expect(screen.getByTestId('gap-block-6.1-risks').textContent).toContain(
      'register.aspects_register',
    );
  });

  it('renders N/A justified sections with justification text', async () => {
    render(<DocumentViewer documentId="doc-1" onBack={mockOnBack} onDiff={mockOnDiff} />);

    await waitFor(() =>
      expect(screen.getByTestId('doc-section-7.2-competence')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('doc-section-7.2-competence').textContent).toContain(
      'Design not in scope',
    );
  });

  it('renders failed sections with explicit marker', async () => {
    render(<DocumentViewer documentId="doc-1" onBack={mockOnBack} onDiff={mockOnDiff} />);

    await waitFor(() => expect(screen.getByTestId('failed-8.1-ops')).toBeInTheDocument());
    expect(screen.getByTestId('failed-8.1-ops').textContent).toContain('Failed');
  });

  it('handles CONTENT_UNAVAILABLE error gracefully', async () => {
    mockQuery.mockImplementation((q: string) => {
      if (q.includes('listDocumentVersions'))
        return Promise.resolve({ listDocumentVersions: mockVersions });
      if (q.includes('getDocumentContent')) return Promise.reject(new Error('CONTENT_UNAVAILABLE'));
      if (q.includes('listGenerationRuns')) return Promise.resolve({ listGenerationRuns: [] });
      return Promise.resolve({});
    });

    render(<DocumentViewer documentId="doc-1" onBack={mockOnBack} onDiff={mockOnDiff} />);
    await waitFor(() => expect(screen.getByTestId('content-unavailable')).toBeInTheDocument());
  });
});

describe('DocumentViewer — review action (joined from run.sections)', () => {
  it('shows review button for prose sections when role can approve M1 and runSection exists', async () => {
    render(<DocumentViewer documentId="doc-1" onBack={mockOnBack} onDiff={mockOnDiff} />);

    await waitFor(() =>
      expect(screen.getByTestId('doc-review-btn-4.1-context')).toBeInTheDocument(),
    );
    // GAP section should NOT have review button
    expect(screen.queryByTestId('doc-review-btn-6.1-risks')).not.toBeInTheDocument();
  });

  it('calls markSectionReviewed with sectionId from the run section (not content)', async () => {
    mockMutate.mockResolvedValue({
      markSectionReviewed: { id: 's1', reviewedBy: 'u1', reviewedAt: '2026-07-15T12:00:00Z' },
    });
    render(<DocumentViewer documentId="doc-1" onBack={mockOnBack} onDiff={mockOnDiff} />);

    await waitFor(() =>
      expect(screen.getByTestId('doc-review-btn-4.1-context')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('doc-review-btn-4.1-context'));

    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
    const [statement, variables] = mockMutate.mock.calls[0];
    expect(statement).toContain('markSectionReviewed');
    // sectionId 's1' comes from the run section, not from content JSON
    expect(variables).toEqual({ input: { sectionId: 's1' } });
  });
});

describe('DocumentViewer — submit for approval errors', () => {
  it('surfaces UNREVIEWED_SECTIONS with proper i18n message', async () => {
    mockMutate.mockRejectedValue(new Error('UNREVIEWED_SECTIONS'));
    render(<DocumentViewer documentId="doc-1" onBack={mockOnBack} onDiff={mockOnDiff} />);

    await waitFor(() => expect(screen.getByTestId('submit-approval-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('submit-approval-btn'));

    await waitFor(() => expect(screen.getByTestId('submit-error')).toBeInTheDocument());
    expect(screen.getByTestId('submit-error').textContent).toContain(
      'Not all sections have been reviewed',
    );
  });

  it('surfaces SoD violation error with proper i18n message', async () => {
    mockMutate.mockRejectedValue(new Error('SoD violation: approver cannot be author'));
    render(<DocumentViewer documentId="doc-1" onBack={mockOnBack} onDiff={mockOnDiff} />);

    await waitFor(() => expect(screen.getByTestId('submit-approval-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('submit-approval-btn'));

    await waitFor(() => expect(screen.getByTestId('submit-error')).toBeInTheDocument());
    expect(screen.getByTestId('submit-error').textContent).toContain('Segregation of duties');
  });

  it('shows success message on successful submit', async () => {
    mockMutate.mockResolvedValue({
      submitDocumentForApproval: { id: 'doc-1', status: 'IN_REVIEW' },
    });
    render(<DocumentViewer documentId="doc-1" onBack={mockOnBack} onDiff={mockOnDiff} />);

    await waitFor(() => expect(screen.getByTestId('submit-approval-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('submit-approval-btn'));

    await waitFor(() => expect(screen.getByTestId('submit-success')).toBeInTheDocument());
    expect(screen.getByTestId('submit-success').textContent).toContain(
      'submitted for approval successfully',
    );
  });
});

describe('DocumentViewer — export button', () => {
  it('shows export-blocked state when backend returns Unknown field', async () => {
    mockMutate.mockImplementation((q: string) => {
      if (q.includes('requestImsExport')) return Promise.reject(new Error('Unknown field'));
      return Promise.resolve({});
    });
    render(<DocumentViewer documentId="doc-1" onBack={mockOnBack} onDiff={mockOnDiff} />);

    await waitFor(() => expect(screen.getByTestId('export-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('export-btn'));

    await waitFor(() => expect(screen.getByTestId('export-blocked')).toBeInTheDocument());
    expect(screen.getByTestId('export-blocked').textContent).toContain('not yet available');
  });
});

describe('DocumentViewer — navigation', () => {
  it('renders version list and calls onBack', async () => {
    render(<DocumentViewer documentId="doc-1" onBack={mockOnBack} onDiff={mockOnDiff} />);

    await waitFor(() => expect(screen.getByTestId('version-list')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('viewer-back'));
    expect(mockOnBack).toHaveBeenCalled();
  });
});
