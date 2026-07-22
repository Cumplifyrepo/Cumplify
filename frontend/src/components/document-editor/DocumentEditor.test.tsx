import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { DocumentEditor } from './DocumentEditor';

/**
 * DocumentEditor component tests (architect addition, 2026-07-22 — closing
 * the gap that triggered the P2 Session 3 bounce: the component itself had
 * zero test coverage, unlike its siblings in this codebase
 * (document-viewer.test.tsx, generation-view.test.tsx) which test rendering
 * with @testing-library/react, not just underlying pure logic).
 *
 * @tiptap/react is mocked — this codebase has no existing Tiptap-in-jsdom
 * test precedent, and the goal here is DocumentEditor's OWN wiring (state
 * management, callback attribution, section-kind routing), not ProseMirror
 * internals. onUpdate is captured from useEditor's options and invoked
 * manually to simulate a human edit.
 */

const mockMutate = vi.fn();
let capturedOnUpdate: ((args: { editor: { getHTML: () => string } }) => void) | null = null;
const chainCommands: string[] = [];

vi.mock('@tiptap/react', () => ({
  useEditor: (opts: { onUpdate?: (args: { editor: { getHTML: () => string } }) => void }) => {
    capturedOnUpdate = opts.onUpdate ?? null;
    return {
      getHTML: () => '<p>mock content</p>',
      chain: () => ({
        focus: () => ({
          insertMermaidBlock: () => ({
            run: () => {
              chainCommands.push('insertMermaidBlock');
            },
          }),
        }),
      }),
    };
  },
  EditorContent: () => <div data-testid="tiptap-editor-content" />,
}));

vi.mock('@tiptap/starter-kit', () => ({ default: {} }));
vi.mock('@tiptap/extension-table', () => ({ default: { configure: () => ({}) } }));
vi.mock('@tiptap/extension-table-row', () => ({ default: {} }));
vi.mock('@tiptap/extension-table-cell', () => ({ default: {} }));
vi.mock('@tiptap/extension-table-header', () => ({ default: {} }));
vi.mock('./MermaidNode', () => ({ MermaidNode: {} }));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { sub: 'user-9', email: 'jane@acme.com' } }),
}));
vi.mock('@/lib/api', () => ({ useGraphQL: () => ({ mutate: mockMutate }) }));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `editor.${key}`,
}));
vi.mock('@/components/shared', () => ({
  SecondaryButton: (p: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...p} />,
  PrimaryButton: (p: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...p} />,
  StatusBadge: ({ status }: { status: string }) => (
    <span data-testid={`badge-${status}`}>{status}</span>
  ),
}));
vi.mock('@/components/shared/GuidanceBanner', () => ({
  GuidanceBanner: ({ message }: { message: string }) => (
    <div data-testid="guidance-banner">{message}</div>
  ),
}));

const PROSE_SECTION = {
  harmonizationKey: '4.1',
  kind: 'prose',
  sentences: [{ text: 'Original content.' }],
};
const GAP_SECTION = {
  harmonizationKey: '6.1',
  kind: 'gap',
  gap: { missingSources: ['register.risk_assessments'] },
};
const NA_SECTION = {
  harmonizationKey: '7.2',
  kind: 'na_justified',
  naJustification: 'Design not in scope',
};
const FAILED_SECTION = { harmonizationKey: '8.1', kind: 'failed' };

beforeEach(() => {
  mockMutate.mockReset();
  capturedOnUpdate = null;
  chainCommands.length = 0;
});

describe('DocumentEditor — section-kind routing', () => {
  it('renders a Tiptap editor for prose sections', () => {
    render(<DocumentEditor sections={[PROSE_SECTION]} runId="run-1" documentId="doc-1" />);
    expect(screen.getByTestId('tiptap-editor-content')).toBeInTheDocument();
  });

  it('renders non-editable content for gap sections (missingSources, no Tiptap instance)', () => {
    render(<DocumentEditor sections={[GAP_SECTION]} runId="run-1" documentId="doc-1" />);
    expect(screen.queryByTestId('tiptap-editor-content')).not.toBeInTheDocument();
    expect(screen.getByText(/register.risk_assessments/)).toBeInTheDocument();
  });

  it('renders na_justified sections with the justification text', () => {
    render(<DocumentEditor sections={[NA_SECTION]} runId="run-1" documentId="doc-1" />);
    expect(screen.getByText('Design not in scope')).toBeInTheDocument();
  });

  it('renders failed sections with the failed marker', () => {
    render(<DocumentEditor sections={[FAILED_SECTION]} runId="run-1" documentId="doc-1" />);
    expect(screen.getByTestId('badge-REJECTED')).toBeInTheDocument();
  });
});

describe('DocumentEditor — human edit attribution', () => {
  it('a human edit shows the RS-9 sync-pending banner (honest, never faked as saved)', () => {
    render(<DocumentEditor sections={[PROSE_SECTION]} runId="run-1" documentId="doc-1" />);
    expect(screen.queryByTestId('guidance-banner')).not.toBeInTheDocument();

    act(() => {

      capturedOnUpdate!({ editor: { getHTML: () => '<p>Edited content.</p>' } });

    });

    expect(screen.getByTestId('guidance-banner')).toBeInTheDocument();
  });
});

describe('DocumentEditor — iterate with agent (regenerateSection)', () => {
  it('calls regenerateSection with runId + harmonizationKey and adds an agent proposal', async () => {
    mockMutate.mockResolvedValue({ regenerateSection: { harmonizationKey: '4.1', kind: 'PROSE' } });
    render(<DocumentEditor sections={[PROSE_SECTION]} runId="run-1" documentId="doc-1" />);

    fireEvent.click(screen.getByText('editor.iterateWithAgent'));

    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
    const [statement, variables] = mockMutate.mock.calls[0];
    expect(statement).toContain('regenerateSection');
    expect(variables).toEqual({ input: { runId: 'run-1', harmonizationKey: '4.1' } });
    // Agent proposal lands as a tracked change → sync-pending banner appears
    await waitFor(() => expect(screen.getByTestId('guidance-banner')).toBeInTheDocument());
  });
});

describe('DocumentEditor — Mermaid insertion (P2S3 gap closure)', () => {
  it('the insert-diagram button calls editor.chain().insertMermaidBlock()', () => {
    render(<DocumentEditor sections={[PROSE_SECTION]} runId="run-1" documentId="doc-1" />);

    fireEvent.click(screen.getByText('editor.insertDiagram'));

    expect(chainCommands).toContain('insertMermaidBlock');
  });
});

describe('DocumentEditor — accept/reject + onConverge', () => {
  it('accepting the only pending change fires onConverge with the converged content', () => {
    const onConverge = vi.fn();
    render(
      <DocumentEditor
        sections={[PROSE_SECTION]}
        runId="run-1"
        documentId="doc-1"
        onConverge={onConverge}
      />,
    );
    act(() => {
      capturedOnUpdate!({ editor: { getHTML: () => '<p>Edited content.</p>' } });
    });

    fireEvent.click(screen.getByText('editor.accept'));

    expect(onConverge).toHaveBeenCalledWith('4.1', expect.any(String));
  });

  it('rejecting the only pending change also fires onConverge (nothing left pending)', () => {
    const onConverge = vi.fn();
    render(
      <DocumentEditor
        sections={[PROSE_SECTION]}
        runId="run-1"
        documentId="doc-1"
        onConverge={onConverge}
      />,
    );
    act(() => {
      capturedOnUpdate!({ editor: { getHTML: () => '<p>Edited content.</p>' } });
    });

    fireEvent.click(screen.getByText('editor.reject'));

    expect(onConverge).toHaveBeenCalledWith('4.1', expect.any(String));
  });

  it('does NOT fire onConverge while a second change is still pending', () => {
    const onConverge = vi.fn();
    render(
      <DocumentEditor
        sections={[PROSE_SECTION]}
        runId="run-1"
        documentId="doc-1"
        onConverge={onConverge}
      />,
    );
    // Two pending changes: one human edit, one agent proposal
    act(() => {
      capturedOnUpdate!({ editor: { getHTML: () => '<p>Edit 1.</p>' } });
    });
    act(() => {
      capturedOnUpdate!({ editor: { getHTML: () => '<p>Edit 2.</p>' } });
    });

    const acceptButtons = screen.getAllByText('editor.accept');
    fireEvent.click(acceptButtons[0]);

    expect(onConverge).not.toHaveBeenCalled();
  });
});
