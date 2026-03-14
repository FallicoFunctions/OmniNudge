import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { api } from '../../lib/api';
import ResetPasswordPage from '../ResetPasswordPage';

const renderPage = (search = '') =>
  render(
    <MemoryRouter initialEntries={[`/reset-password${search}`]}>
      <ResetPasswordPage />
    </MemoryRouter>,
  );

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    renderPage();
    expect(document.body).toBeTruthy();
  });

  it('shows error state when no token is present', async () => {
    renderPage();
    await waitFor(() => {
      // Without a token setIsValidating is immediately set to false and error shown
      expect(document.body.textContent).toMatch(/invalid|error|link/i);
    });
  });

  it('shows validating spinner then form when token is valid', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ valid: true, username: 'alice' });

    renderPage('?token=good-token');

    // Initially validating spinner shown
    await waitFor(() => {
      expect(screen.queryByText(/validating/i)).toBeInTheDocument();
    });

    await waitFor(() => {
      // After validation completes the password fields should appear
      expect(screen.getByPlaceholderText(/enter new password/i)).toBeInTheDocument();
    });
  });

  it('shows validation error for short password', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ valid: true, username: 'alice' });

    renderPage('?token=good-token');

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/enter new password/i)).toBeInTheDocument();
    });

    const passwordInput = screen.getByPlaceholderText(/enter new password/i);
    const confirmInput = screen.getByPlaceholderText(/confirm new password/i);

    fireEvent.change(passwordInput, { target: { value: 'short' } });
    fireEvent.change(confirmInput, { target: { value: 'short' } });

    fireEvent.submit(screen.getByRole('button', { name: /reset|save|submit|change/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/at least 8 characters|minimum|password.*length/i),
      ).toBeInTheDocument();
    });
  });

  it('shows error for mismatched passwords', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ valid: true, username: 'alice' });

    renderPage('?token=good-token');

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/enter new password/i)).toBeInTheDocument();
    });

    const passwordInput = screen.getByPlaceholderText(/enter new password/i);
    const confirmInput = screen.getByPlaceholderText(/confirm new password/i);

    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.change(confirmInput, { target: { value: 'differentpass' } });

    fireEvent.submit(screen.getByRole('button', { name: /reset|save|submit|change/i }));

    await waitFor(() => {
      expect(screen.getByText(/do not match|passwords.*match/i)).toBeInTheDocument();
    });
  });
});
