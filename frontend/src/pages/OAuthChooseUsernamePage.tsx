import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';

export default function OAuthChooseUsernamePage() {
  const [searchParams] = useSearchParams();
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();

  const pendingToken = searchParams.get('pending_token') ?? '';
  const [username, setUsername] = useState(searchParams.get('suggested') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const trimmed = username.trim();
    if (trimmed.length < 3 || trimmed.length > 50) {
      setError('Username must be between 3 and 50 characters.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const { token } = await api.post<{ token: string }>('/auth/oauth/complete', {
        pending_token: pendingToken,
        username: trimmed,
      });
      await loginWithToken(token);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!pendingToken) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm font-medium text-red-600">This sign-up link is invalid. Please try signing in again.</p>
        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Back to home
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
      >
        <h1 className="mb-1 text-lg font-semibold text-[var(--color-text-primary)]">Choose your username</h1>
        <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
          This is how other people will see you on OmniNudge. You can't change it later.
        </p>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          placeholder="username"
          minLength={3}
          maxLength={50}
          required
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="mt-4 w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? 'Creating account…' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
