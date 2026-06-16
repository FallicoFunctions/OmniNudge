import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { FormField } from '../components/forms/FormField';
import { Button } from '../components/ui/Button';

type ResetPasswordError = {
  message: string;
  field?: 'password' | 'confirmPassword';
};

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isValidating, setIsValidating] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [username, setUsername] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<ResetPasswordError | null>(null);
  const [success, setSuccess] = useState(false);

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setIsValidating(false);
      setError({ message: t('auth.resetPasswordPage.errors.invalidLinkRequestNew') });
      return;
    }

    const validateToken = async () => {
      try {
        const response = await api.get<{ valid: boolean; username?: string }>(
          `/auth/validate-reset-token?token=${token}`
        );
        setIsValid(response.valid);
        setUsername(response.username || '');
      } catch {
        setIsValid(false);
        setError({ message: t('auth.resetPasswordPage.errors.linkInvalidOrExpiredRequestNew') });
      } finally {
        setIsValidating(false);
      }
    };

    validateToken();
  }, [t, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError({
        field: 'password',
        message: t('auth.resetPasswordPage.errors.passwordMinLength'),
      });
      return;
    }

    if (password !== confirmPassword) {
      setError({
        field: 'confirmPassword',
        message: t('auth.resetPasswordPage.errors.passwordsDoNotMatch'),
      });
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
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { error?: string } } };
      setError({
        message:
          apiError.response?.data?.error || t('auth.resetPasswordPage.errors.resetFailedTryAgain'),
      });
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
            <span className="ml-3 text-[var(--color-text-primary)]">
              {t('auth.resetPasswordPage.status.validating')}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (!isValid || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
        <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
          <h1 className="mb-4 text-2xl font-bold text-[var(--color-text-primary)]">
            {t('auth.resetPasswordPage.invalidLinkTitle')}
          </h1>
          <p className="mb-6 text-[var(--color-text-secondary)]">
            {error?.message || t('auth.resetPasswordPage.errors.linkInvalidOrExpired')}
          </p>
          <Button
            variant="primary"
            onClick={() => navigate('/', { replace: true })}
            className="w-full"
          >
            {t('auth.resetPasswordPage.actions.returnToHome')}
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
            {t('auth.resetPasswordPage.success.title')}
          </h1>
          <p className="mb-6 text-center text-[var(--color-text-secondary)]">
            {t('auth.resetPasswordPage.success.description')}
          </p>
          <p className="text-center text-sm text-[var(--color-text-muted)]">
            {t('auth.resetPasswordPage.status.redirectingHome')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)] px-4">
      <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
        <h1 className="mb-2 text-2xl font-bold text-[var(--color-text-primary)]">
          {t('auth.resetPasswordPage.title')}
        </h1>
        {username && (
          <p className="mb-6 text-sm text-[var(--color-text-secondary)]">
            {t('auth.resetPasswordPage.resettingFor')}{' '}
            <span className="font-semibold">{username}</span>
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField
            label={t('auth.resetPasswordPage.fields.newPassword')}
            required
            error={error?.field === 'password' ? error.message : undefined}
          >
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              placeholder={t('auth.resetPasswordPage.fields.newPasswordPlaceholder')}
              required
              minLength={8}
              disabled={isSubmitting}
            />
          </FormField>

          <FormField
            label={t('auth.resetPasswordPage.fields.confirmPassword')}
            required
            error={error?.field === 'confirmPassword' ? error.message : undefined}
          >
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              placeholder={t('auth.resetPasswordPage.fields.confirmPasswordPlaceholder')}
              required
              minLength={8}
              disabled={isSubmitting}
            />
          </FormField>

          {error && !error.field && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {error.message}
            </div>
          )}

          <Button type="submit" variant="primary" disabled={isSubmitting} className="w-full">
            {isSubmitting
              ? t('auth.resetPasswordPage.status.submitting')
              : t('auth.resetPasswordPage.actions.resetPassword')}
          </Button>
        </form>
      </div>
    </div>
  );
}
