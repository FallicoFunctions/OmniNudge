import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Download, KeyRound } from 'lucide-react';

const CONFIRM_COUNT = 3;
const FILE_NAME = 'omninudge-recovery-phrase.txt';

function pickPositions(total: number): number[] {
  const picked = new Set<number>();
  while (picked.size < CONFIRM_COUNT) {
    picked.add(Math.floor(Math.random() * total));
  }
  return [...picked].sort((a, b) => a - b);
}

interface RecoveryPhraseStepProps {
  phrase: string;
  onDone: () => void;
}

/**
 * Shows a new recovery phrase once and asks for three of its words before
 * going on. It has no close or skip control: the phrase is the only way back
 * into the messages after a forgotten password, and it is never shown again.
 */
export function RecoveryPhraseStep({ phrase, onDone }: RecoveryPhraseStepProps) {
  const { t } = useTranslation();
  const words = useMemo(() => phrase.split(' '), [phrase]);
  const [positions] = useState(() => pickPositions(words.length));
  const [confirming, setConfirming] = useState(false);
  const [answers, setAnswers] = useState<string[]>(() => positions.map(() => ''));
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Leaving the page now would lose the only copy the user could see.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(phrase);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const download = () => {
    const blob = new Blob([`${t('keys.phrase.fileHeading')}\n\n${phrase}\n`], {
      type: 'text/plain',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = FILE_NAME;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const confirm = (event: FormEvent) => {
    event.preventDefault();
    const matches = positions.every(
      (position, i) => answers[i].trim().toLowerCase() === words[position]
    );
    if (!matches) {
      setError(t('keys.phrase.mismatch'));
      return;
    }
    onDone();
  };

  if (confirming) {
    return (
      <form onSubmit={confirm} className="space-y-4">
        <div>
          <h2
            id="key-step-title"
            className="text-xl font-semibold text-[var(--color-text-primary)]"
          >
            {t('keys.phrase.confirmTitle')}
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {t('keys.phrase.confirmIntro')}
          </p>
        </div>

        {error && (
          <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {positions.map((position, i) => (
          <div key={position}>
            <label
              htmlFor={`phrase-word-${position}`}
              className="block text-sm font-semibold text-[var(--color-text-primary)]"
            >
              {t('keys.phrase.confirmLabel', { number: position + 1 })}
            </label>
            <input
              id={`phrase-word-${position}`}
              type="text"
              required
              value={answers[i]}
              onChange={(e) =>
                setAnswers((current) => current.map((a, j) => (j === i ? e.target.value : a)))
              }
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        ))}

        <button
          type="submit"
          className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]"
        >
          {t('keys.phrase.confirm')}
        </button>
        <button
          type="button"
          onClick={() => {
            setError('');
            setConfirming(false);
          }}
          className="w-full text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-dark)]"
        >
          {t('keys.phrase.back')}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <KeyRound size={24} className="text-[var(--color-primary)]" aria-hidden="true" />
        <h2
          id="key-step-title"
          className="mt-2 text-xl font-semibold text-[var(--color-text-primary)]"
        >
          {t('keys.phrase.title')}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{t('keys.phrase.intro')}</p>
      </div>

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {words.map((word, i) => (
          <li
            key={i}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm"
          >
            <span className="mr-2 text-[var(--color-text-muted)]">{i + 1}</span>
            <span className="font-semibold text-[var(--color-text-primary)]">{word}</span>
          </li>
        ))}
      </ol>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void copy()}
          className="flex flex-1 items-center justify-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-border)]"
        >
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copied ? t('keys.phrase.copied') : t('keys.phrase.copy')}
        </button>
        <button
          type="button"
          onClick={download}
          className="flex flex-1 items-center justify-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-border)]"
        >
          <Download size={16} aria-hidden="true" />
          {t('keys.phrase.download')}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]"
      >
        {t('keys.phrase.saved')}
      </button>
    </div>
  );
}
