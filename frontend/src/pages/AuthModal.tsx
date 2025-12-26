import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface AuthModalProps {
  mode: 'login' | 'signup';
  onClose: () => void;
  onSwitch: (mode: 'login' | 'signup') => void;
  onSuccess?: () => void;
}

export default function AuthModal({ mode, onClose, onSwitch, onSuccess }: AuthModalProps) {
  const isLogin = mode === 'login';
  const { login, register } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    const normalizedUsername = username.trim();
    try {
      if (isLogin) {
        await login({ username: normalizedUsername, password });
      } else {
        await register({ username: normalizedUsername, password, email: email || undefined });
      }
      if (onSuccess) {
        onSuccess();
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : isLogin ? 'Login failed' : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-lg rounded-lg bg-[var(--color-surface)] p-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {isLogin ? 'Login' : 'Sign Up'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            Close
          </button>
        </div>
        <div className="mt-4 max-h-[80vh] overflow-y-auto px-1 pb-2">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">OmniNudge</h1>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {isLogin ? 'Sign in to your account' : 'Create your account'}
            </p>
          </div>
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}
            <div>
              <label
                htmlFor="auth-username"
                className="block text-sm font-medium text-[var(--color-text-primary)]"
              >
                Username *
              </label>
              <input
                id="auth-username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                placeholder="Username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="username"
              />
            </div>
            {!isLogin && (
              <div>
                <label
                  htmlFor="auth-email"
                  className="block text-sm font-medium text-[var(--color-text-primary)]"
                >
                  Email (optional)
                </label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                  placeholder="you@email.com"
                  autoComplete="email"
                />
              </div>
            )}
            <div>
              <label
                htmlFor="auth-password"
                className="block text-sm font-medium text-[var(--color-text-primary)]"
              >
                Password *
              </label>
              <input
                id="auth-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                placeholder="Password"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 disabled:opacity-50"
            >
              {isLoading ? (isLogin ? 'Signing in...' : 'Creating account...') : isLogin ? 'Sign in' : 'Sign up'}
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-[var(--color-text-secondary)]">
            {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              type="button"
              onClick={() => onSwitch(isLogin ? 'signup' : 'login')}
              className="font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-dark)]"
            >
              {isLogin ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
