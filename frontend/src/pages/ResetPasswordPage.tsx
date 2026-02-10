import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { FormField } from '../components/forms/FormField';
import { Button } from '../components/ui/Button';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isValidating, setIsValidating] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [username, setUsername] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setIsValidating(false);
      setError('Invalid reset link. Please request a new password reset.');
      return;
    }

    const validateToken = async () => {
      try {
        const response = await api.get<{ valid: boolean; username?: string }>(`/auth/validate-reset-token?token=${token}`);
        setIsValid(response.valid);
        setUsername(response.username || '');
      } catch (err) {
        setIsValid(false);
        setError('This reset link is invalid or has expired. Please request a new password reset.');
      } finally {
        setIsValidating(false);
      }
    };

    validateToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsSubmitting(true);

    try {
      await api.post('/auth/reset-password', {
        token,
        new_password: password,
      });

      setSuccess(true);

      // Redirect to home page after 3 seconds
      setTimeout(() => {
        navigate('/', { replace: true });
      }, 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reset password. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isValidating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
        <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
          <div className="flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-border)] border-t-[var(--color-primary)]"></div>
            <span className="ml-3 text-[var(--color-text-primary)]">Validating reset link...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!isValid || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
        <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
          <h1 className="mb-4 text-2xl font-bold text-[var(--color-text-primary)]">Invalid Reset Link</h1>
          <p className="mb-6 text-[var(--color-text-secondary)]">
            {error || 'This password reset link is invalid or has expired.'}
          </p>
          <Button
            variant="primary"
            onClick={() => navigate('/', { replace: true })}
            className="w-full"
          >
            Return to Home
          </Button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
        <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
          <div className="mb-4 flex items-center justify-center">
            <svg
              className="h-16 w-16 text-green-500"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h1 className="mb-4 text-center text-2xl font-bold text-[var(--color-text-primary)]">
            Password Reset Successful
          </h1>
          <p className="mb-6 text-center text-[var(--color-text-secondary)]">
            Your password has been successfully reset. You can now log in with your new password.
          </p>
          <p className="text-center text-sm text-[var(--color-text-muted)]">
            Redirecting to home page...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)] px-4">
      <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
        <h1 className="mb-2 text-2xl font-bold text-[var(--color-text-primary)]">Reset Your Password</h1>
        {username && (
          <p className="mb-6 text-sm text-[var(--color-text-secondary)]">
            Resetting password for <span className="font-semibold">{username}</span>
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField
            label="New Password"
            required
            error={error && error.includes('8 characters') ? error : undefined}
          >
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              placeholder="Enter new password"
              required
              minLength={8}
              disabled={isSubmitting}
            />
          </FormField>

          <FormField
            label="Confirm Password"
            required
            error={error && error.includes('match') ? error : undefined}
          >
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              placeholder="Confirm new password"
              required
              minLength={8}
              disabled={isSubmitting}
            />
          </FormField>

          {error && !error.includes('8 characters') && !error.includes('match') && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? 'Resetting Password...' : 'Reset Password'}
          </Button>
        </form>
      </div>
    </div>
  );
}
