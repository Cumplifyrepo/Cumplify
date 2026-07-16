import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { DiffView } from './diff-view';

const mockQuery = vi.fn();
const mockOnBack = vi.fn();

vi.mock('@/lib/api', () => ({ useGraphQL: () => ({ query: mockQuery, mutate: vi.fn() }) }));
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
  Panel: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  PrimaryButton: ({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...p}>{children}</button>
  ),
  SecondaryButton: ({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...p}>{children}</button>
  ),
  ErrorState: ({ onRetry }: { onRetry: () => void }) => (
    <button onClick={onRetry}>retry-action</button>
  ),
}));

const mockDiffContent = JSON.stringify({
  '4.1-context': {
    added: ['New sentence about external issues.'],
    removed: ['Old sentence about context.'],
    kindChange: null,
  },
  '6.1-risks': { added: [], removed: ['Removed risk sentence.'], kindChange: 'PROSE→GAP' },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DiffView — content rendering', () => {
  it('renders diff summary with additions and deletions count', async () => {
    mockQuery.mockResolvedValue({
      getDocumentVersionDiff: { additions: 3, deletions: 2, content: mockDiffContent },
    });

    render(<DiffView v1="v1-id" v2="v2-id" onBack={mockOnBack} />);

    await waitFor(() => expect(screen.getByTestId('diff-summary')).toBeInTheDocument());
    expect(screen.getByTestId('diff-summary').textContent).toContain('+3');
    expect(screen.getByTestId('diff-summary').textContent).toContain('-2');
  });

  it('renders per-section diff with added and removed lines', async () => {
    mockQuery.mockResolvedValue({
      getDocumentVersionDiff: { additions: 1, deletions: 1, content: mockDiffContent },
    });

    render(<DiffView v1="v1-id" v2="v2-id" onBack={mockOnBack} />);

    await waitFor(() => expect(screen.getByTestId('diff-section-4.1-context')).toBeInTheDocument());
    expect(screen.getByTestId('diff-section-4.1-context').textContent).toContain(
      'New sentence about external issues',
    );
    expect(screen.getByTestId('diff-section-4.1-context').textContent).toContain(
      'Old sentence about context',
    );
  });

  it('renders kindChange label when section type changed', async () => {
    mockQuery.mockResolvedValue({
      getDocumentVersionDiff: { additions: 0, deletions: 1, content: mockDiffContent },
    });

    render(<DiffView v1="v1-id" v2="v2-id" onBack={mockOnBack} />);

    await waitFor(() => expect(screen.getByTestId('diff-section-6.1-risks')).toBeInTheDocument());
    expect(screen.getByTestId('diff-section-6.1-risks').textContent).toContain(
      'Section type changed',
    );
  });
});

describe('DiffView — error states', () => {
  it('handles CONTENT_UNAVAILABLE gracefully', async () => {
    mockQuery.mockRejectedValue(new Error('CONTENT_UNAVAILABLE'));

    render(<DiffView v1="v1-id" v2="v2-id" onBack={mockOnBack} />);

    await waitFor(() => expect(screen.getByTestId('diff-unavailable')).toBeInTheDocument());
    expect(screen.getByTestId('diff-unavailable').textContent).toContain('Diff unavailable');
  });

  it('handles null diff result (single version / empty state)', async () => {
    mockQuery.mockResolvedValue({ getDocumentVersionDiff: null });

    render(<DiffView v1="v1-id" v2="v2-id" onBack={mockOnBack} />);

    await waitFor(() => expect(screen.getByTestId('diff-unavailable')).toBeInTheDocument());
  });
});

describe('DiffView — navigation', () => {
  it('calls onBack when back button is clicked', async () => {
    mockQuery.mockResolvedValue({
      getDocumentVersionDiff: { additions: 0, deletions: 0, content: '{}' },
    });

    render(<DiffView v1="v1-id" v2="v2-id" onBack={mockOnBack} />);

    await waitFor(() => expect(screen.getByTestId('diff-back')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('diff-back'));
    expect(mockOnBack).toHaveBeenCalled();
  });
});
