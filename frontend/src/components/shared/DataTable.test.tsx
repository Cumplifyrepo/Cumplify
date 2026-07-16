import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataTable } from './DataTable';

// Mock EmptyState
vi.mock('./EmptyState', () => ({
  EmptyState: ({ message }: { message: string }) => <p data-testid="empty">{message}</p>,
}));

interface TestItem {
  id: string;
  name: string;
  value: number;
}

const columns = [
  { key: 'name', header: 'Name', render: (item: TestItem) => item.name },
  { key: 'value', header: 'Value', render: (item: TestItem) => item.value },
];

const data: TestItem[] = [
  { id: '1', name: 'Alpha', value: 10 },
  { id: '2', name: 'Beta', value: 20 },
];

describe('DataTable', () => {
  it('renders rows from data', () => {
    render(<DataTable columns={columns} data={data} rowKey={(d) => d.id} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('calls onRowClick when a row is clicked', () => {
    const onClick = vi.fn();
    render(<DataTable columns={columns} data={data} rowKey={(d) => d.id} onRowClick={onClick} />);
    fireEvent.click(screen.getByText('Alpha'));
    expect(onClick).toHaveBeenCalledWith(data[0]);
  });

  it('renders EmptyState when data is empty and emptyMessage provided', () => {
    render(
      <DataTable columns={columns} data={[]} rowKey={(d) => d.id} emptyMessage="Nothing here" />,
    );
    expect(screen.getByTestId('empty')).toHaveTextContent('Nothing here');
  });

  it('renders column headers', () => {
    render(<DataTable columns={columns} data={data} rowKey={(d) => d.id} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
  });

  it('supports keyboard navigation on rows with onRowClick', () => {
    const onClick = vi.fn();
    render(<DataTable columns={columns} data={data} rowKey={(d) => d.id} onRowClick={onClick} />);
    const row = screen.getByText('Beta').closest('tr')!;
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledWith(data[1]);
  });
});
