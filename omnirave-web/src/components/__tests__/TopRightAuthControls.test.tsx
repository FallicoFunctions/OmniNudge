import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TopRightAuthControls } from '../TopRightAuthControls';

describe('TopRightAuthControls', () => {
  it('shows guest login and signup actions', () => {
    const onOpenLogin = vi.fn();
    const onOpenSignup = vi.fn();

    render(
      <TopRightAuthControls
        mode="guest"
        onOpenLogin={onOpenLogin}
        onOpenSignup={onOpenSignup}
        onLogout={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

    expect(onOpenLogin).toHaveBeenCalledTimes(1);
    expect(onOpenSignup).toHaveBeenCalledTimes(1);
  });
});
