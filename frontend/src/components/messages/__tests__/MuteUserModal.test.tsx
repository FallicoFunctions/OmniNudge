import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MuteUserModal } from '../MuteUserModal';

describe('MuteUserModal', () => {
  // A mute asked for a reason that nobody was ever shown.
  it('asks only how long, and sends only that', () => {
    const onConfirm = vi.fn();
    render(
      <MuteUserModal
        username="TestUser"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        isLoading={false}
      />
    );

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Reason')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '24 hours' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));

    expect(onConfirm).toHaveBeenCalledWith(1440);
    expect(onConfirm.mock.calls[0]).toHaveLength(1);
  });
});
