import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ERROR_MESSAGES: Record<string, string> = {
  unknown_provider: 'That sign-in provider is not supported.',
  invalid_state: 'Sign-in session expired. Please try again.',
  no_code: 'No authorization code received. Please try again.',
  token_exchange: 'Could not complete sign-in with the provider. Please try again.',
  user_info: 'Could not retrieve your profile from the provider. Please try again.',
  account_error: 'Could not create or find your account. Please try again.',
  server_error: 'An unexpected error occurred. Please try again.',
  login_failed: 'Sign-in failed. Please try again.',
};

export default function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const { completeOAuthLogin } = useAuth();
  const navigate = useNavigate();
  const handled = useRef(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const errorCode = searchParams.get('auth_error');

    if (errorCode) {
      const msg = ERROR_MESSAGES[errorCode] ?? 'Sign-in failed. Please try again.';
      setErrorMsg(msg);
      return;
    }

    completeOAuthLogin()
      .then(() => navigate('/', { replace: true }))
      .catch(() => setErrorMsg(ERROR_MESSAGES['login_failed']));
  }, [completeOAuthLogin, navigate, searchParams]);

  if (errorMsg) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm font-medium text-red-600">{errorMsg}</p>
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
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-[var(--color-text-secondary)]">Signing you in…</p>
    </div>
  );
}
