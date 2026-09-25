/**
 * The page read the server's reason the way an Axios error carries it, but
 * lib/api throws a plain Error with the reason on the error itself, so every
 * refusal showed the generic failure text. Here the real client parses the
 * server's real answer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { authenticatedFetch } from '../../services/authSession';
import ResetPasswordPage from '../ResetPasswordPage';

vi.mock('../../services/authSession', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('../../services/accountKeysService', () => ({
  prepareSignUp: vi.fn(async () => ({
    keys: { loginKey: 'the-login-key', wrapKey: {} },
    kdf_salt: 'the-salt',
    kdf_iterations: 600000,
  })),
}));

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// The token check succeeds; the reset itself answers with `reset`.
function server(reset: () => Promise<Response>) {
  vi.mocked(authenticatedFetch).mockImplementation(async (input) =>
    String(input).includes('/auth/validate-reset-token')
      ? json(200, { valid: true, username: 'alice' })
      : reset()
  );
}

async function submitNewPassword() {
  render(
    <MemoryRouter initialEntries={['/reset-password?token=used-token']}>
      <ResetPasswordPage />
    </MemoryRouter>
  );
  fireEvent.change(await screen.findByPlaceholderText(/enter new password/i), {
    target: { value: 'a-long-new-password' },
  });
  fireEvent.change(screen.getByPlaceholderText(/confirm new password/i), {
    target: { value: 'a-long-new-password' },
  });
  fireEvent.submit(screen.getByRole('button', { name: /reset|save|submit|change/i }));
}

beforeEach(() => {
  vi.mocked(authenticatedFetch).mockReset();
});

describe('ResetPasswordPage with the real api client', () => {
  it("shows the server's reason when it refuses the reset", async () => {
    server(async () =>
      json(400, {
        error: 'Invalid or expired reset token',
        code: 'bad_request',
        message: 'Invalid or expired reset token',
        request_id: 'd2bcc42a-a528-4eb1-a43b-1eed301881df',
      })
    );

    await submitNewPassword();

    expect(await screen.findByText('Invalid or expired reset token')).toBeInTheDocument();
  });

  it('keeps the general message when the request never reached the server', async () => {
    server(async () => {
      throw new TypeError('Failed to fetch');
    });

    await submitNewPassword();

    expect(
      await screen.findByText('Failed to reset password. Please try again.')
    ).toBeInTheDocument();
  });
});
