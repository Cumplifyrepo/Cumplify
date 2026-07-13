import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';

// Mock next-intl — returns key if no translation found; for 'status' namespace
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => {
    const translations: Record<string, Record<string, string>> = {
      status: {
        DRAFT: 'Draft',
        PENDING: 'Pending',
        IN_REVIEW: 'In review',
        APPROVED: 'Approved',
        CLOSED: 'Closed',
        CRITICAL: 'Critical',
        HIGH: 'High',
        MEDIUM: 'Medium',
        LOW: 'Low',
        IN_PROGRESS: 'In progress',
        REJECTED: 'Rejected',
        VERIFIED: 'Verified',
        OBSOLETE: 'Obsolete',
        OPEN: 'Open',
      },
    };
    const t = (key: string) => translations[ns]?.[key] ?? key;
    t.has = (key: string) => !!(translations[ns]?.[key]);
    return t;
  },
}));

describe('StatusBadge', () => {
  it('renders DRAFT with warning variant', () => {
    render(<StatusBadge status="DRAFT" />);
    const badge = screen.getByText('Draft');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('warning');
  });

  it('renders APPROVED with success variant', () => {
    render(<StatusBadge status="APPROVED" />);
    const badge = screen.getByText('Approved');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('success');
  });

  it('renders CRITICAL with danger variant', () => {
    render(<StatusBadge status="CRITICAL" />);
    const badge = screen.getByText('Critical');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('danger');
  });

  it('renders IN_PROGRESS with info variant', () => {
    render(<StatusBadge status="IN_PROGRESS" />);
    const badge = screen.getByText('In progress');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('info');
  });

  it('renders unknown status with info variant and formatted text', () => {
    render(<StatusBadge status="UNKNOWN_STATUS" />);
    const badge = screen.getByText('UNKNOWN STATUS');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('info');
  });
});
