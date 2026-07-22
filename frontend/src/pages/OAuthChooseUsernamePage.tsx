import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';

export default function OAuthChooseUsernamePage() {
  const [searchParams] = useSearchParams();
  const { completeOAuthLogin } = useAuth();
  const navigate = useNavigate();

  const noEmail = searchParams.get('no_email') === '1';
  const [username, setUsername] = useState(searchParams.get('suggested') ?? '');
  const [email, setEmail] = useState('');
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
      await api.post('/auth/oauth/complete', {
        username: trimmed,
        email: email.trim() || undefined,
      });
      await completeOAuthLogin();
      navigate('/', { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not create your account. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
      >
        <h1 className="mb-1 text-lg font-semibold text-[var(--color-text-primary)]">
          Choose your username
        </h1>
        <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
          This is how other people will see you on OmniNudge. You can't change it later.
        </p>

        <div className="flex flex-col gap-3">
          <div>
            <label
              htmlFor="oauth-username"
              className="block text-sm font-semibold text-[var(--color-text-primary)]"
            >
              Username <span className="text-red-500">*</span>
            </label>
            <input
              id="oauth-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              placeholder="username"
              minLength={3}
              maxLength={50}
              required
            />
          </div>

          {noEmail && (
            <div>
              <label
                htmlFor="oauth-email"
                className="block text-sm font-semibold text-[var(--color-text-primary)]"
              >
                Email <span className="text-xs text-[var(--color-text-secondary)]">(optional)</span>
              </label>
              <input
                id="oauth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                placeholder="you@example.com"
                autoComplete="email"
              />
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                Lets you recover your account and link other sign-in methods later.
              </p>
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

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
