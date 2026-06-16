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
