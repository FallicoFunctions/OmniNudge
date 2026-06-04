import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthPopup } from '../AuthPopup';

describe('AuthPopup', () => {
  afterEach(() => {
    cleanup();
  });

  it('submits signup fields through the in-place runtime auth shell', async () => {
    const onSignup = vi.fn().mockResolvedValue(undefined);

    render(
      <AuthPopup
        mode="signup"
        isOpen
        error=""
        isSubmitting={false}
        onClose={vi.fn()}
        onSwitchMode={vi.fn()}
        onLogin={vi.fn()}
        onSignup={onSignup}
      />,
    );

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'nick' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nick@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse-battery-staple' } });
    fireEvent.change(screen.getByLabelText('Turnstile token'), { target: { value: 'cf-token-1' } });
    fireEvent.click(screen.getByLabelText(/accept privacy policy/i));
    fireEvent.click(screen.getByLabelText(/accept terms of service/i));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(onSignup).toHaveBeenCalledWith({
      username: 'nick',
      email: 'nick@example.com',
      password: 'correct-horse-battery-staple',
      turnstileToken: 'cf-token-1',
      acceptPrivacyPolicy: true,
      acceptTerms: true,
    });
  });

  it('auto-focuses username and clears fields after close and reopen', async () => {
    const { rerender } = render(
      <AuthPopup
        mode="signup"
        isOpen
        error=""
        isSubmitting={false}
        onClose={vi.fn()}
        onSwitchMode={vi.fn()}
        onLogin={vi.fn()}
        onSignup={vi.fn()}
      />,
    );

    const username = screen.getByLabelText('Username');
    await waitFor(() => expect(screen.getByLabelText('Username')).toHaveFocus());

    fireEvent.change(username, { target: { value: 'nick' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nick@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret1234' } });

    rerender(
      <AuthPopup
        mode="signup"
        isOpen={false}
        error=""
        isSubmitting={false}
        onClose={vi.fn()}
        onSwitchMode={vi.fn()}
        onLogin={vi.fn()}
        onSignup={vi.fn()}
      />,
    );

    rerender(
      <AuthPopup
        mode="signup"
        isOpen
        error=""
        isSubmitting={false}
        onClose={vi.fn()}
        onSwitchMode={vi.fn()}
        onLogin={vi.fn()}
        onSignup={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Username')).toHaveValue('');
    expect(screen.getByLabelText('Email')).toHaveValue('');
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });
});
