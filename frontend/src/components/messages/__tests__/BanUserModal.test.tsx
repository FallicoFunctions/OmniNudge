import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BanUserModal } from '../BanUserModal';

describe('BanUserModal', () => {
  // The reason reaches the banned user alone; the window must say so, or an
  // admin writes it believing the whole group will read it.
  it('says who sees the reason, and sends it with the ban', () => {
    const onConfirm = vi.fn();
    render(
      <BanUserModal
        username="TestUser"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        isLoading={false}
      />
    );

    expect(
      screen.getByText('Only the banned user sees this reason. It is also kept in the audit log.')
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'spam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ban' }));
    expect(onConfirm).toHaveBeenCalledWith('spam', false);
  });
});
