import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmptyState from '../../src/components/ui/EmptyState';

describe('EmptyState', () => {
  it('renders with title and description', () => {
    render(
      <EmptyState
        title="No items found"
        description="Try adjusting your filters"
      />
    );

    expect(screen.getByText('No items found')).toBeInTheDocument();
    expect(screen.getByText('Try adjusting your filters')).toBeInTheDocument();
  });

  it('renders custom icon', () => {
    render(<EmptyState icon="🎨" title="Empty" />);
    expect(screen.getByText('🎨')).toBeInTheDocument();
  });

  it('renders primary action button', async () => {
    const handleAction = vi.fn();
    const user = userEvent.setup();

    render(
      <EmptyState
        title="Empty"
        action={{ label: 'Create New', onClick: handleAction }}
      />
    );

    const button = screen.getByRole('button', { name: 'Create New' });
    await user.click(button);

    expect(handleAction).toHaveBeenCalledTimes(1);
  });

  it('renders secondary action button', async () => {
    const handleSecondary = vi.fn();
    const user = userEvent.setup();

    render(
      <EmptyState
        title="Empty"
        secondaryAction={{ label: 'Learn More', onClick: handleSecondary }}
      />
    );

    const button = screen.getByRole('button', { name: 'Learn More' });
    await user.click(button);

    expect(handleSecondary).toHaveBeenCalledTimes(1);
  });

  it('renders without actions', () => {
    render(<EmptyState title="No results" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
