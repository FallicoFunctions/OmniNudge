import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const EDIT_WINDOW_SECONDS = 15 * 60;

interface MessageEditModeProps {
  initialContent: string;
  sentAt: string | Date;
  onSave: (content: string) => Promise<void> | void;
  onCancel: () => void;
  isSaving?: boolean;
  maxLength?: number;
}

function parseSentAt(sentAt: string | Date): number {
  const date = sentAt instanceof Date ? sentAt : new Date(sentAt);
  return Number.isNaN(date.getTime()) ? Date.now() : date.getTime();
}

function formatRemainingTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function MessageEditMode({
  initialContent,
  sentAt,
  onSave,
  onCancel,
  isSaving = false,
  maxLength,
}: MessageEditModeProps) {
  const { t } = useTranslation();
  const sentAtMs = useMemo(() => parseSentAt(sentAt), [sentAt]);

  const [content, setContent] = useState(initialContent);
  const [localSaving, setLocalSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  const elapsedSeconds = Math.floor((nowMs - sentAtMs) / 1000);
  const remainingSeconds = Math.max(0, EDIT_WINDOW_SECONDS - elapsedSeconds);
  const editExpired = remainingSeconds <= 0;
  const saveDisabled = isSaving || localSaving || editExpired;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saveDisabled) return;

    const trimmed = content.trim();
    if (trimmed.length === 0) {
      setError(t('messages.editing.errors.empty'));
      return;
    }

    setError(null);
    setLocalSaving(true);
    try {
      await onSave(trimmed);
    } catch {
      setError(t('messages.editing.errors.saveFailed'));
    } finally {
      setLocalSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        maxLength={maxLength}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
        rows={3}
        aria-label={t('messages.editing.ariaInput')}
      />

      <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
        <span>
          {editExpired
            ? t('messages.editing.expired')
            : t('messages.editing.timeLeft', {
                time: formatRemainingTime(remainingSeconds),
              })}
        </span>
        {typeof maxLength === 'number' && (
          <span>
            {content.length}/{maxLength}
          </span>
        )}
      </div>

      {error && (
        <p className="text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={saveDisabled}
          className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {localSaving || isSaving ? t('messages.editing.saving') : t('common.save')}
        </button>
      </div>
    </form>
  );
}
