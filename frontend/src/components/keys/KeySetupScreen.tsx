import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, KeyRound } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { lockScroll, unlockScroll } from '../../utils/scrollLock';
import { RecoveryPhraseStep } from './RecoveryPhraseStep';

// Typed to confirm a fresh start; kept in English so it matches the words the
// warning shows.
export const FRESH_START_TEXT = 'START FRESH';

// AuthContext throws this message when a password does not open the copy.
const WRONG_PASSWORD = 'Wrong password';

// The same minimum sign-up uses; AuthContext checks it again.
const MIN_APP_PASSWORD_LENGTH = 8;

const inputClass =
  'mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]';
const primaryButtonClass =
  'w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50';
const textButtonClass =
  'w-full text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-dark)]';

/**
 * The full-screen key step. It covers the app while this device cannot read
 * the account's messages, or while a new recovery phrase waits to be saved.
 */
export default function KeySetupScreen() {
  const { keyStatus, acknowledgePhrase } = useAuth();
  switch (keyStatus.state) {
    case 'show-phrase':
      return (
        <KeyScreen>
          <PhraseStep
            phrase={keyStatus.phrase}
            offerAppPassword={keyStatus.offerAppPassword}
            onDone={acknowledgePhrase}
          />
        </KeyScreen>
      );
    case 'needs-password':
      return (
        <KeyScreen>
          <PasswordStep />
        </KeyScreen>
      );
    case 'needs-recovery':
      return (
        <KeyScreen>
          <RecoveryStep hasRecoveryCopy={keyStatus.hasRecoveryCopy} />
        </KeyScreen>
      );
    case 'failed':
      return (
        <KeyScreen>
          <FailedStep />
        </KeyScreen>
      );
    default:
      return null;
  }
}

// Portalled out of the app root and above every layer that can open with it:
// the call screen is z-[100], and a purchase over a paused call z-[110]. The
// card centres with m-auto, not flex centring, so a step taller than the screen
// (a phone with the keyboard open) scrolls instead of losing its top.
function KeyScreen({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    lockScroll();
    // The app behind cannot be reached by keyboard or screen reader.
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    dialogRef.current?.focus();
    return () => {
      root?.removeAttribute('inert');
      unlockScroll();
    };
  }, []);
  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="key-step-title"
      className="fixed inset-0 z-[120] flex overflow-y-auto bg-[var(--color-background)] p-4 outline-none"
    >
      <div className="m-auto w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
        {children}
      </div>
    </div>,
    document.body
  );
}

function StepHeader({
  title,
  intro,
  warning,
}: {
  title: string;
  intro: string;
  warning?: boolean;
}) {
  return (
    <div>
      {warning ? (
        <AlertTriangle size={24} className="text-red-500" aria-hidden="true" />
      ) : (
        <KeyRound size={24} className="text-[var(--color-primary)]" aria-hidden="true" />
      )}
      <h2
        id="key-step-title"
        className="mt-2 text-xl font-semibold text-[var(--color-text-primary)]"
      >
        {title}
      </h2>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{intro}</p>
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
      {message}
    </div>
  );
}

function SignOutButton() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  return (
    <button type="button" onClick={logout} className={textButtonClass}>
      {t('keys.signOut')}
    </button>
  );
}

function PasswordStep() {
  const { t } = useTranslation();
  const { unlockWithPassword } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await unlockWithPassword(password);
    } catch (err) {
      setError(
        err instanceof Error && err.message === WRONG_PASSWORD
          ? t('keys.password.wrong')
          : t('keys.password.failed')
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <StepHeader title={t('keys.password.title')} intro={t('keys.password.intro')} />
      <ErrorMessage message={error} />
      <div>
        <label
          htmlFor="key-password"
          className="block text-sm font-semibold text-[var(--color-text-primary)]"
        >
          {t('keys.password.label')}
        </label>
        <input
          id="key-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          autoComplete="current-password"
        />
      </div>
      <button type="submit" disabled={busy} className={primaryButtonClass}>
        {busy ? t('keys.working') : t('keys.password.submit')}
      </button>
      <SignOutButton />
    </form>
  );
}

// The words as the phrase was made: lower case, one space between.
export const normalizePhrase = (phrase: string) =>
  phrase.trim().toLowerCase().split(/\s+/).join(' ');

function RecoveryStep({ hasRecoveryCopy }: { hasRecoveryCopy: boolean }) {
  const { t } = useTranslation();
  const { recoverKeys } = useAuth();
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lost, setLost] = useState(false);

  if (!hasRecoveryCopy || lost) {
    return <FreshStartStep onBack={hasRecoveryCopy ? () => setLost(false) : undefined} />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await recoverKeys(normalizePhrase(phrase));
    } catch {
      setError(t('keys.recovery.wrong'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <StepHeader title={t('keys.recovery.title')} intro={t('keys.recovery.intro')} />
      <ErrorMessage message={error} />
      <div>
        <label
          htmlFor="key-recovery-phrase"
          className="block text-sm font-semibold text-[var(--color-text-primary)]"
        >
          {t('keys.recovery.label')}
        </label>
        <textarea
          id="key-recovery-phrase"
          required
          rows={3}
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          className={inputClass}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <button type="submit" disabled={busy} className={primaryButtonClass}>
        {busy ? t('keys.working') : t('keys.recovery.submit')}
      </button>
      <button type="button" onClick={() => setLost(true)} className={textButtonClass}>
        {t('keys.recovery.lost')}
      </button>
      <SignOutButton />
    </form>
  );
}

function FreshStartStep({ onBack }: { onBack?: () => void }) {
  const { t } = useTranslation();
  const { startFresh } = useAuth();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const confirmed = typed.trim().toUpperCase() === FRESH_START_TEXT;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!confirmed) return;
    setError('');
    setBusy(true);
    try {
      await startFresh();
    } catch {
      setError(t('keys.fresh.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <StepHeader
        warning
        title={t('keys.fresh.title')}
        intro={onBack ? t('keys.fresh.lostIntro') : t('keys.fresh.noCopyIntro')}
      />
      <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{t('keys.fresh.warning')}</div>
      <ErrorMessage message={error} />
      <div>
        <label
          htmlFor="key-fresh-confirm"
          className="block text-sm font-semibold text-[var(--color-text-primary)]"
        >
          {t('keys.fresh.confirmLabel', { text: FRESH_START_TEXT })}
        </label>
        <input
          id="key-fresh-confirm"
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className={inputClass}
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <button
        type="submit"
        disabled={!confirmed || busy}
        className="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
      >
        {busy ? t('keys.working') : t('keys.fresh.submit')}
      </button>
      {onBack && (
        <button type="button" onClick={onBack} className={textButtonClass}>
          {t('keys.fresh.back')}
        </button>
      )}
      <SignOutButton />
    </form>
  );
}

// The phrase first; then, for an account with no password, the optional app
// password, offered while the phrase can still open the recovery copy.
function PhraseStep({
  phrase,
  offerAppPassword,
  onDone,
}: {
  phrase: string;
  offerAppPassword: boolean;
  onDone: () => void;
}) {
  const [offering, setOffering] = useState(false);
  if (offering) {
    return <AppPasswordOffer phrase={phrase} onSkip={onDone} />;
  }
  return (
    <RecoveryPhraseStep
      phrase={phrase}
      onDone={offerAppPassword ? () => setOffering(true) : onDone}
    />
  );
}

function AppPasswordOffer({ phrase, onSkip }: { phrase: string; onSkip: () => void }) {
  const { t } = useTranslation();
  const { setAppPassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < MIN_APP_PASSWORD_LENGTH) {
      setError(t('keys.app.short', { count: MIN_APP_PASSWORD_LENGTH }));
      return;
    }
    if (password !== confirmation) {
      setError(t('keys.app.mismatch'));
      return;
    }
    setBusy(true);
    try {
      await setAppPassword(phrase, password);
    } catch {
      setError(t('keys.app.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <StepHeader title={t('keys.app.title')} intro={t('keys.app.intro')} />
      <ErrorMessage message={error} />
      <div>
        <label
          htmlFor="key-app-password"
          className="block text-sm font-semibold text-[var(--color-text-primary)]"
        >
          {t('keys.app.label')}
        </label>
        <input
          id="key-app-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          autoComplete="new-password"
        />
      </div>
      <div>
        <label
          htmlFor="key-app-password-confirm"
          className="block text-sm font-semibold text-[var(--color-text-primary)]"
        >
          {t('keys.app.confirmLabel')}
        </label>
        <input
          id="key-app-password-confirm"
          type="password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          className={inputClass}
          autoComplete="new-password"
        />
      </div>
      <button type="submit" disabled={busy} className={primaryButtonClass}>
        {busy ? t('keys.working') : t('keys.app.submit')}
      </button>
      <button type="button" disabled={busy} onClick={onSkip} className={textButtonClass}>
        {t('keys.app.skip')}
      </button>
    </form>
  );
}

function FailedStep() {
  const { t } = useTranslation();
  const { retryKeys } = useAuth();
  const [busy, setBusy] = useState(false);

  const retry = async () => {
    setBusy(true);
    try {
      await retryKeys();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <StepHeader warning title={t('keys.failed.title')} intro={t('keys.failed.intro')} />
      <button
        type="button"
        disabled={busy}
        onClick={() => void retry()}
        className={primaryButtonClass}
      >
        {busy ? t('keys.working') : t('keys.failed.retry')}
      </button>
      <SignOutButton />
    </div>
  );
}
