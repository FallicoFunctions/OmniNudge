import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import type { KeyBackup } from '../../types/auth';
import { useAuth } from '../../contexts/AuthContext';
import {
  replacePhraseWithPassword,
  replacePhraseWithPhrase,
  type PendingPhrase,
} from '../../services/accountKeysService';
import { RecoveryPhraseStep } from '../keys/RecoveryPhraseStep';
import { normalizePhrase } from '../keys/KeySetupScreen';

const MIN_APP_PASSWORD_LENGTH = 8;

const inputClass =
  'mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)]';
const primaryButtonClass =
  'rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50';
const textButtonClass =
  'text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-dark)]';
const sectionClass = 'rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4';
const labelClass = 'block text-sm font-semibold text-[var(--color-text-primary)]';

function Alert({ tone, message }: { tone: 'error' | 'success'; message: string }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={
        tone === 'error'
          ? 'rounded-md bg-red-50 p-3 text-sm text-red-600'
          : 'rounded-md bg-green-50 p-3 text-sm text-green-700'
      }
    >
      {message}
    </div>
  );
}

/**
 * The Settings tab for message encryption: a new recovery phrase, proved with
 * the password (or, with no password, the current phrase), and the app
 * password for an account that has none.
 */
export default function EncryptionSettings() {
  const { t } = useTranslation();
  const [backup, setBackup] = useState<KeyBackup | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [appPasswordAdded, setAppPasswordAdded] = useState(false);

  const load = useCallback(() => {
    setLoadFailed(false);
    api
      .get<KeyBackup>('/auth/key-backup')
      .then(setBackup)
      .catch(() => setLoadFailed(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loadFailed) {
    return <Alert tone="error" message={t('keys.settings.loadFailed')} />;
  }
  if (!backup) {
    return <p className="text-sm text-[var(--color-text-secondary)]">{t('common.loading')}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
          {t('keys.settings.title')}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          {t('keys.settings.intro')}
        </p>
      </div>
      <NewPhraseSection backup={backup} />
      {appPasswordAdded && <Alert tone="success" message={t('keys.settings.appAdded')} />}
      {!backup.has_password && (
        <AppPasswordSection
          onAdded={() => {
            setAppPasswordAdded(true);
            load();
          }}
        />
      )}
    </div>
  );
}

function NewPhraseSection({ backup }: { backup: KeyBackup }) {
  const { t } = useTranslation();
  const usesPassword = backup.has_password;
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingPhrase | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saved, setSaved] = useState(false);

  // An account with a password that still uses the old sign-in has no copy its
  // password opens; the next sign-in moves it.
  if (usesPassword && backup.auth_scheme !== 2) {
    return (
      <section className={sectionClass}>
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
          {t('keys.settings.phraseTitle')}
        </h3>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          {t('keys.settings.unavailable')}
        </p>
      </section>
    );
  }

  const start = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSaved(false);
    setBusy(true);
    try {
      setPending(
        usesPassword
          ? await replacePhraseWithPassword(secret)
          : await replacePhraseWithPhrase(normalizePhrase(secret))
      );
      setSecret('');
    } catch (err) {
      setError(
        !usesPassword
          ? t('keys.settings.wrongPhrase')
          : err instanceof Error && err.message === 'Wrong password'
            ? t('keys.settings.wrongPassword')
            : t('keys.settings.failed')
      );
    } finally {
      setBusy(false);
    }
  };

  // Only now does the new copy replace the old one: the user holds the phrase.
  const save = async () => {
    if (!pending) return;
    setSaveFailed(false);
    setBusy(true);
    try {
      await pending.save();
      setPending(null);
      setSaved(true);
    } catch {
      setSaveFailed(true);
    } finally {
      setBusy(false);
    }
  };

  // A failed save may still have reached the server (a lost response), so the
  // old phrase may no longer work: there is no cancel here, only a save again
  // of the same copy, which the user already holds the phrase for.
  if (pending && saveFailed) {
    return (
      <section className={`${sectionClass} space-y-4`}>
        <Alert tone="error" message={t('keys.settings.saveFailed')} />
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className={primaryButtonClass}
        >
          {busy ? t('keys.working') : t('keys.settings.retry')}
        </button>
      </section>
    );
  }

  if (pending) {
    return (
      <section className={`${sectionClass} space-y-4`}>
        <RecoveryPhraseStep phrase={pending.phrase} onDone={() => void save()} />
        <button
          type="button"
          disabled={busy}
          onClick={() => setPending(null)}
          className={`w-full ${textButtonClass}`}
        >
          {t('keys.settings.cancel')}
        </button>
      </section>
    );
  }

  return (
    <section className={sectionClass}>
      <form onSubmit={start} className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t('keys.settings.phraseTitle')}
          </h3>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {usesPassword
              ? t('keys.settings.phraseIntroPassword')
              : t('keys.settings.phraseIntroPhrase')}
          </p>
        </div>
        {saved && <Alert tone="success" message={t('keys.settings.saved')} />}
        {error && <Alert tone="error" message={error} />}
        <div>
          <label htmlFor="settings-phrase-secret" className={labelClass}>
            {usesPassword ? t('keys.settings.passwordLabel') : t('keys.settings.phraseLabel')}
          </label>
          {usesPassword ? (
            <input
              id="settings-phrase-secret"
              type="password"
              required
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              className={inputClass}
              autoComplete="current-password"
            />
          ) : (
            <textarea
              id="settings-phrase-secret"
              required
              rows={3}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              className={inputClass}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </div>
        <button type="submit" disabled={busy || !secret.trim()} className={primaryButtonClass}>
          {busy ? t('keys.working') : t('keys.settings.start')}
        </button>
      </form>
    </section>
  );
}

function AppPasswordSection({ onAdded }: { onAdded: () => void }) {
  const { t } = useTranslation();
  const { setAppPassword } = useAuth();
  const [phrase, setPhrase] = useState('');
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
      await setAppPassword(normalizePhrase(phrase), password);
      onAdded();
    } catch {
      setError(t('keys.settings.appFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={sectionClass}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t('keys.settings.appTitle')}
          </h3>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{t('keys.app.intro')}</p>
        </div>
        {error && <Alert tone="error" message={error} />}
        <div>
          <label htmlFor="settings-app-phrase" className={labelClass}>
            {t('keys.settings.phraseLabel')}
          </label>
          <textarea
            id="settings-app-phrase"
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
        <div>
          <label htmlFor="settings-app-password" className={labelClass}>
            {t('keys.app.label')}
          </label>
          <input
            id="settings-app-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            autoComplete="new-password"
          />
        </div>
        <div>
          <label htmlFor="settings-app-password-confirm" className={labelClass}>
            {t('keys.app.confirmLabel')}
          </label>
          <input
            id="settings-app-password-confirm"
            type="password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className={inputClass}
            autoComplete="new-password"
          />
        </div>
        <button type="submit" disabled={busy || !phrase.trim()} className={primaryButtonClass}>
          {busy ? t('keys.working') : t('keys.app.submit')}
        </button>
      </form>
    </section>
  );
}
