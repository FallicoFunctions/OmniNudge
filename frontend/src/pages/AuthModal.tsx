import { useState, useRef, useMemo, useEffect } from 'react';
import { lockScroll, unlockScroll } from '../utils/scrollLock';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { ModalCloseButton } from '../components/ui/ModalCloseButton';
import { calculatePasswordStrength } from '../utils/passwordStrength';
import { api } from '../lib/api';

interface AuthModalProps {
  mode: 'login' | 'signup' | 'forgot-password';
  onClose: () => void;
  onSwitch: (mode: 'login' | 'signup' | 'forgot-password') => void;
  onSuccess?: () => void;
}

export default function AuthModal({ mode, onClose, onSwitch, onSuccess }: AuthModalProps) {
  const { t } = useTranslation();
  const isLogin = mode === 'login';
  const isSignup = mode === 'signup';
  const isForgotPassword = mode === 'forgot-password';
  const { login, register } = useAuth();

  // Login/Signup state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Forgot password state
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  // FORM-5: Calculate password strength for signup mode
  const passwordStrength = useMemo(() => {
    if (isSignup && password) {
      return calculatePasswordStrength(password);
    }
    return null;
  }, [isSignup, password]);

  const [keepLoggedIn, setKeepLoggedIn] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const [acceptPrivacyPolicy, setAcceptPrivacyPolicy] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acknowledgedNoEmail, setAcknowledgedNoEmail] = useState(false);

  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  // Lock body scroll while modal is open — prevents iOS Safari scroll freeze after modal closes
  useEffect(() => {
    lockScroll();
    return () => unlockScroll();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate Turnstile token for signup
    if (isSignup && !turnstileToken) {
      setError(t('auth.security.verificationRequired'));
      return;
    }

    // Validate no-email acknowledgment for signup
    if (isSignup && !email && !acknowledgedNoEmail) {
      setError(t('auth.errors.acknowledgeNoEmailLimitations'));
      return;
    }

    setIsLoading(true);
    const normalizedUsername = username.trim();
    try {
      if (isLogin) {
        await login({ username: normalizedUsername, password, keep_logged_in: keepLoggedIn });
      } else if (isSignup) {
        await register({
          username: normalizedUsername,
          password,
          email: email || undefined,
          turnstile_token: turnstileToken,
          accept_privacy_policy: acceptPrivacyPolicy,
          accept_terms: acceptTerms,
        });
      }
      if (onSuccess) {
        onSuccess();
      } else {
        onClose();
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isLogin
            ? t('auth.errors.loginFailed')
            : t('auth.errors.registrationFailed')
      );
      // Reset Turnstile on error
      if (isSignup && turnstileRef.current) {
        turnstileRef.current.reset();
        setTurnstileToken('');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setForgotLoading(true);

    try {
      await api.post('/auth/forgot-password', {
        username: forgotUsername.trim(),
      });
      setForgotSuccess(true);
    } catch {
      // Show generic message for security
      setForgotSuccess(true);
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      {/* MODAL-1 & MODAL-3: Compact modal with standard close button */}
      <div className="relative w-full max-w-md rounded-lg bg-[var(--color-surface)] p-6 shadow-xl">
        {/* Standard close button */}
        <ModalCloseButton onClose={onClose} />

        <div className="border-b border-[var(--color-border)] pb-3 mb-4">
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
            {isForgotPassword
              ? t('auth.resetPasswordTitle')
              : isLogin
                ? t('auth.loginTitle')
                : t('auth.registerTitle')}
          </h2>
        </div>

        <div className="mt-4 max-h-[80vh] overflow-y-auto px-1 pb-2">
          {/* Forgot Password Form */}
          {isForgotPassword && (
            <>
              {forgotSuccess ? (
                <div className="space-y-4">
                  <div className="rounded-md bg-green-50 p-4 text-sm text-green-800">
                    <p className="font-semibold mb-2">
                      {t('auth.forgotPasswordFlow.checkEmailTitle')}
                    </p>
                    <p>{t('auth.forgotPasswordFlow.checkEmailDescription')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSwitch('login')}
                    className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]"
                  >
                    {t('auth.forgotPasswordFlow.returnToLogin')}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    {t('auth.forgotPasswordFlow.description')}
                  </p>

                  {error && (
                    <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</div>
                  )}

                  <div>
                    <label
                      htmlFor="forgot-username"
                      className="block text-sm font-semibold text-[var(--color-text-primary)]"
                    >
                      {t('common.username')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="forgot-username"
                      type="text"
                      required
                      value={forgotUsername}
                      onChange={(e) => setForgotUsername(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                      placeholder={t('auth.fields.usernamePlaceholder')}
                      autoComplete="username"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 disabled:opacity-50"
                  >
                    {forgotLoading
                      ? t('auth.forgotPasswordFlow.sending')
                      : t('auth.forgotPasswordFlow.sendResetLink')}
                  </button>

                  <p className="text-center text-sm text-[var(--color-text-secondary)]">
                    {t('auth.forgotPasswordFlow.rememberPassword')}{' '}
                    <button
                      type="button"
                      onClick={() => onSwitch('login')}
                      className="font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-dark)]"
                    >
                      {t('auth.buttons.signIn')}
                    </button>
                  </p>
                </form>
              )}
            </>
          )}

          {/* Login/Signup Form */}
          {!isForgotPassword && (
            <>
              <div className="text-center">
                <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
                  {t('auth.title')}
                </h1>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {isLogin ? t('auth.loginSubtitle') : t('auth.signupSubtitle')}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                {error && (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</div>
                )}


                <div>
                  <label
                    htmlFor="auth-username"
                    className="block text-sm font-semibold text-[var(--color-text-primary)]"
                  >
                    {t('auth.fields.username')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="auth-username"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                    placeholder={t('auth.fields.usernamePlaceholder')}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    autoComplete="username"
                  />
                </div>

                {isSignup && (
                  <div>
                    <label
                      htmlFor="auth-email"
                      className="block text-sm font-semibold text-[var(--color-text-primary)]"
                    >
                      {t('auth.fields.email')}{' '}
                      <span className="text-[var(--color-text-secondary)] text-xs">
                        {t('common.optional')}
                      </span>
                    </label>
                    <input
                      id="auth-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                      placeholder={t('auth.fields.emailPlaceholder')}
                      autoComplete="email"
                    />
                    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                      {t('auth.emailVerificationNote')}
                    </p>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="auth-password"
                    className="block text-sm font-semibold text-[var(--color-text-primary)]"
                  >
                    {t('auth.fields.password')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="auth-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                    placeholder={t('auth.fields.passwordPlaceholder')}
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                  />

                  {/* FORM-5: Password strength indicator for signup */}
                  {isSignup && passwordStrength && password.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {/* Strength bar */}
                      <div className="flex gap-1">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className="h-1 flex-1 rounded transition-colors"
                            style={{
                              backgroundColor:
                                i <= passwordStrength.score ? passwordStrength.color : '#e5e7eb',
                            }}
                          />
                        ))}
                      </div>

                      {/* Strength label */}
                      <div
                        className="text-sm font-medium"
                        style={{ color: passwordStrength.color }}
                      >
                        {passwordStrength.label}
                      </div>

                      {/* Requirements checklist */}
                      {passwordStrength.feedback.length > 0 && (
                        <ul className="text-xs text-[var(--color-text-secondary)] space-y-1">
                          {passwordStrength.feedback.map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                    {t('auth.privacyNote')}
                  </p>
                </div>

                {isLogin && (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <input
                          id="keep-logged-in"
                          type="checkbox"
                          checked={keepLoggedIn}
                          onChange={(e) => setKeepLoggedIn(e.target.checked)}
                          className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                        />
                        <label
                          htmlFor="keep-logged-in"
                          className="ml-2 block text-sm text-[var(--color-text-primary)]"
                        >
                          {t('auth.keepLoggedIn')}
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={() => onSwitch('forgot-password')}
                        className="text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-dark)]"
                      >
                        Forgot password?
                      </button>
                    </div>
                  </>
                )}

                {/* No-email acknowledgment for signup */}
                {isSignup && !email && (
                  <div className="flex items-start border-t border-[var(--color-border)] pt-4">
                    <input
                      id="acknowledge-no-email"
                      type="checkbox"
                      required
                      checked={acknowledgedNoEmail}
                      onChange={(e) => setAcknowledgedNoEmail(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                    />
                    <label
                      htmlFor="acknowledge-no-email"
                      className="ml-2 block text-sm text-[var(--color-text-primary)]"
                    >
                      I understand that without an email, I won't be able to reset my password if I
                      forget it. <span className="text-red-500">*</span>
                    </label>
                  </div>
                )}

                {/* Policy acceptance checkboxes for signup */}
                {isSignup && (
                  <div className="space-y-3 border-t border-[var(--color-border)] pt-4">
                    <div className="flex items-start">
                      <input
                        id="accept-privacy"
                        type="checkbox"
                        required
                        checked={acceptPrivacyPolicy}
                        onChange={(e) => setAcceptPrivacyPolicy(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                      />
                      <label
                        htmlFor="accept-privacy"
                        className="ml-2 block text-sm text-[var(--color-text-primary)]"
                      >
                        {t('auth.policy.acceptPrivacy')}{' '}
                        <a
                          href="/privacy"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--color-primary)] hover:underline"
                        >
                          {t('auth.policy.privacyPolicy')}
                        </a>{' '}
                        <span className="text-red-500">*</span>
                      </label>
                    </div>

                    <div className="flex items-start">
                      <input
                        id="accept-terms"
                        type="checkbox"
                        required
                        checked={acceptTerms}
                        onChange={(e) => setAcceptTerms(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                      />
                      <label
                        htmlFor="accept-terms"
                        className="ml-2 block text-sm text-[var(--color-text-primary)]"
                      >
                        {t('auth.policy.acceptTerms')}{' '}
                        <a
                          href="/terms"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--color-primary)] hover:underline"
                        >
                          {t('auth.policy.termsOfService')}
                        </a>{' '}
                        <span className="text-red-500">*</span>
                      </label>
                    </div>
                  </div>
                )}

                {isSignup && turnstileSiteKey && (
                  <div className="flex justify-center">
                    <Turnstile
                      ref={turnstileRef}
                      siteKey={turnstileSiteKey}
                      onSuccess={(token) => setTurnstileToken(token)}
                      onError={() => {
                        setTurnstileToken('');
                        setError(t('auth.security.verificationFailed'));
                      }}
                      onExpire={() => setTurnstileToken('')}
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={
                    isLoading ||
                    (isSignup &&
                      (!turnstileToken ||
                        !acceptPrivacyPolicy ||
                        !acceptTerms ||
                        (!email && !acknowledgedNoEmail)))
                  }
                  className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 disabled:opacity-50"
                >
                  {isLoading
                    ? isLogin
                      ? t('auth.buttons.signingIn')
                      : t('auth.buttons.creatingAccount')
                    : isLogin
                      ? t('auth.buttons.signIn')
                      : t('auth.buttons.signUp')}
                </button>
              </form>

              {/* Social login */}
              <div className="mt-4">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-[var(--color-border)]" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-[var(--color-surface)] px-2 text-[var(--color-text-muted)]">
                      or continue with
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex gap-3">
                  {/* Google */}
                  <a
                    href={`${import.meta.env.VITE_API_URL}/auth/oauth/google`}
                    className="flex flex-1 items-center justify-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-border)] transition-colors"
                  >
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Google
                  </a>

                  {/* Discord */}
                  <a
                    href={`${import.meta.env.VITE_API_URL}/auth/oauth/discord`}
                    className="flex flex-1 items-center justify-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-border)] transition-colors"
                  >
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="#5865F2">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
                    </svg>
                    Discord
                  </a>
                </div>
              </div>

              <p className="mt-4 text-center text-sm text-[var(--color-text-secondary)]">
                {isLogin ? t('auth.switch.noAccount') : t('auth.switch.hasAccount')}{' '}
                <button
                  type="button"
                  onClick={() => onSwitch(isLogin ? 'signup' : 'login')}
                  className="font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-dark)]"
                >
                  {isLogin ? t('auth.switch.signUpLink') : t('auth.switch.signInLink')}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
