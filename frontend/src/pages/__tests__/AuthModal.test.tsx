import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// --- Utility mocks ---
vi.mock('../../utils/scrollLock', () => ({
  lockScroll: vi.fn(),
  unlockScroll: vi.fn(),
}));
vi.mock('@marsidev/react-turnstile', () => ({
  Turnstile: ({ onSuccess }: { onSuccess?: (token: string) => void }) => (
    <button data-testid="turnstile" onClick={() => onSuccess?.('mock-token')}>
      Verify
    </button>
  ),
}));
vi.mock('../../utils/passwordStrength', () => ({
  calculatePasswordStrength: vi.fn(() => ({ score: 2, label: 'Fair' })),
}));
vi.mock('../../components/ui/ModalCloseButton', () => ({
  ModalCloseButton: ({ onClose }: { onClose: () => void }) => (
    <button onClick={onClose} aria-label="Close">
      ×
    </button>
  ),
}));
vi.mock('../../lib/api', () => ({
  api: { post: vi.fn().mockResolvedValue({}) },
}));

// --- Context mocks ---
const mockLogin = vi.fn();
const mockRegister = vi.fn();
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    login: mockLogin,
    register: mockRegister,
  }),
}));

import AuthModal from '../AuthModal';

const defaultProps = {
  mode: 'login' as const,
  onClose: vi.fn(),
  onSwitch: vi.fn(),
  onSuccess: vi.fn(),
};

const renderModal = (props = {}) => {
  const merged = { ...defaultProps, ...props };
  return render(
    <MemoryRouter>
      <AuthModal {...merged} />
    </MemoryRouter>
  );
};

describe('AuthModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login form by default', () => {
    renderModal({ mode: 'login' });
    expect(screen.getByPlaceholderText(/username/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument();
  });

  it('renders signup form when mode is signup', () => {
    renderModal({ mode: 'signup' });
    // signup form must include a "Sign Up" / "Create Account" heading distinct from login
    expect(
      screen.getByRole('heading', { name: /sign up|create account|register/i })
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/username/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument();
  });

  it('calls onSwitch when toggle link is clicked', () => {
    const onSwitch = vi.fn();
    renderModal({ mode: 'login', onSwitch });
    // Find the "Sign up" / create account link
    const signupLink = screen.getByRole('button', { name: /sign up|create account|register/i });
    fireEvent.click(signupLink);
    expect(onSwitch).toHaveBeenCalled();
  });

  it('calls login with correct args on submit', async () => {
    mockLogin.mockResolvedValue(undefined);
    renderModal({ mode: 'login' });

    fireEvent.change(screen.getByPlaceholderText(/username/i), {
      target: { value: 'testuser' },
    });
    fireEvent.change(screen.getByPlaceholderText(/password/i), {
      target: { value: 'secret123' },
    });
    fireEvent.submit(document.querySelector('form')!);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'testuser', password: 'secret123' })
      );
    });
  });

  it('shows error message on failed login', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid credentials'));
    renderModal({ mode: 'login' });

    fireEvent.change(screen.getByPlaceholderText(/username/i), {
      target: { value: 'baduser' },
    });
    fireEvent.change(screen.getByPlaceholderText(/password/i), {
      target: { value: 'wrong' },
    });
    fireEvent.submit(document.querySelector('form')!);

    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
    });
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    renderModal({ mode: 'login', onClose });
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
