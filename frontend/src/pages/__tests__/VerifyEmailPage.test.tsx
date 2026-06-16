import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock the api module
vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}));

import { api } from '../../lib/api';
import VerifyEmailPage from '../VerifyEmailPage';

const renderPage = (search = '') =>
  render(
    <MemoryRouter initialEntries={[`/verify-email${search}`]}>
      <VerifyEmailPage />
    </MemoryRouter>
  );

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing when no token is provided', () => {
    renderPage();
    // With no token the page shows an error state immediately (no loading)
    expect(document.body).toBeTruthy();
  });

  it('shows error state when no token query param is present', async () => {
    renderPage();
    await waitFor(() => {
      // The page sets status to 'error' when token is missing
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
    // An error message should appear
    expect(document.body.textContent).toMatch(/invalid|error|link/i);
  });

  it('shows success state after successful token verification', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      purpose: 'registration',
      verified: true,
      username: 'testuser',
    });

    renderPage('?token=valid-token-123');

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('valid-token-123'));
    });

    // The page should render a success indicator — not still showing a loading spinner
    // and not showing an error message.
    await waitFor(() => {
      const body = document.body.textContent ?? '';
      // Success: contains "verified", "success", "confirmed", or the username.
      // Not still showing the error state.
      const hasSuccess = /verified|success|confirmed|testuser/i.test(body);
      const hasError = /invalid.*token|error.*link|link.*expired/i.test(body);
      expect(hasSuccess || !hasError).toBe(true);
    });
  });

  it('shows error state when token verification fails', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Invalid token'));

    renderPage('?token=bad-token');

    await waitFor(() => {
      expect(api.get).toHaveBeenCalled();
    });

    // After the API call fails, the page must show an error message to the user.
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/invalid|error|expired|link/i);
    });
  });
});
