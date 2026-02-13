import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [purpose, setPurpose] = useState('');

  // Prevent duplicate verification requests
  const hasVerified = useRef(false);

  useEffect(() => {
    const debugLog = (...args: unknown[]) => {
      if (import.meta.env.DEV) {
        console.log(...args);
      }
    };

    // Guard: only verify once
    if (hasVerified.current) {
      return;
    }

    if (!token) {
      setStatus('error');
      setMessage(t('auth.verifyEmailPage.errors.invalidLink'));
      return;
    }

    const verifyEmail = async () => {
      // Mark as verifying to prevent duplicate calls
      hasVerified.current = true;

      try {
        const response = await api.get<{ purpose: string; verified: boolean; username: string }>(`/auth/verify-email?token=${token}`);
        debugLog('Verification response:', response);
        setStatus('success');
        setPurpose(response.purpose);

        // Redirect after 3 seconds
        setTimeout(() => {
          debugLog('Redirecting... purpose:', response.purpose);
          if (response.purpose === 'registration') {
            debugLog('Navigating to /');
            navigate('/', { replace: true });
          } else if (response.purpose === 'update_email') {
            debugLog('Navigating to /settings with emailVerified flag');
            navigate('/settings', { replace: true, state: { emailVerified: true } });
          } else {
            console.warn('Unknown purpose:', response.purpose, '- staying on verification page');
          }
        }, 3000);
      } catch (err) {
        console.error('Verification error:', err);
        setStatus('error');
        setMessage(t('auth.verifyEmailPage.errors.invalidOrExpired'));
      }
    };

    verifyEmail();
  }, [navigate, t, token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)] px-4">
      <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
        {status === 'loading' && (
          <div className="text-center">
            <div className="mb-4 flex justify-center">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-[var(--color-border)] border-t-[var(--color-primary)]"></div>
            </div>
            <p className="text-[var(--color-text-primary)]">{t('auth.verifyEmailPage.status.verifying')}</p>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center">
            <div className="mb-4 flex justify-center">
              <svg className="h-16 w-16 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="mb-2 text-2xl font-bold text-[var(--color-text-primary)]">
              {t('auth.verifyEmailPage.success.title')}
            </h1>
            <p className="mb-4 text-[var(--color-text-secondary)]">
              {t('auth.verifyEmailPage.success.description')}
              {purpose === 'registration' ? ` ${t('auth.verifyEmailPage.success.welcome')}` : null}
            </p>
            <p className="text-sm text-[var(--color-text-muted)]">
              {t('auth.verifyEmailPage.status.redirecting')}
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <div className="mb-4 flex justify-center">
              <svg className="h-16 w-16 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="mb-2 text-2xl font-bold text-[var(--color-text-primary)]">
              {t('auth.verifyEmailPage.error.title')}
            </h1>
            <p className="mb-6 text-[var(--color-text-secondary)]">
              {message}
            </p>
            <Button
              variant="primary"
              onClick={() => navigate('/', { replace: true })}
              className="w-full"
            >
              {t('auth.verifyEmailPage.actions.returnToHome')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
