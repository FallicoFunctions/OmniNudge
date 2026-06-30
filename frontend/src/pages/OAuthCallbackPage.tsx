import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const token = searchParams.get('token');
    const error = searchParams.get('auth_error');

    if (error || !token) {
      navigate('/?auth_error=' + (error ?? 'missing_token'), { replace: true });
      return;
    }

    loginWithToken(token)
      .then(() => navigate('/', { replace: true }))
      .catch(() => navigate('/?auth_error=login_failed', { replace: true }));
  }, [loginWithToken, navigate, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-[var(--color-text-secondary)]">Signing you in…</p>
    </div>
  );
}
