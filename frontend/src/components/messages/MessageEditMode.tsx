import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const EDIT_WINDOW_SECONDS = 15 * 60;

interface MessageEditModeProps {
  initialContent: string;
  sentAt: string | Date;
  onSave: (content: string) => Promise<void> | void;
  onCancel: () => void;
  isSaving?: boolean;
  maxLength?: number;
  /** True when rendered inside an own-message (primary-color) bubble. */
  isOwnMessage?: boolean;
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
  isOwnMessage = false,
}: MessageEditModeProps) {
  const { t } = useTranslation();
  const sentAtMs = useMemo(() => parseSentAt(sentAt), [sentAt]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [content, setContent] = useState(initialContent);
  const [localSaving, setLocalSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  // Fix 2: auto-focus textarea and place cursor at end on mount
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  // Fix 11: Escape cancels the edit
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

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

  // Fix 3: adjust colors when inside an own-message (primary/blue) bubble
  const textareaClass = isOwnMessage
    ? 'w-full rounded-md border border-white/30 bg-white/15 px-3 py-2 text-sm text-white placeholder-white/50 focus:border-white/60 focus:outline-none focus:ring-1 focus:ring-white/60'
    : 'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]';

  const metaClass = isOwnMessage
    ? 'flex items-center justify-between text-xs text-white/70'
    : 'flex items-center justify-between text-xs text-[var(--color-text-secondary)]';

  const cancelClass = isOwnMessage
    ? 'rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20'
    : 'rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]';

  const saveClass = isOwnMessage
    ? 'rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-[var(--color-primary)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60'
    : 'rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        maxLength={maxLength}
        className={textareaClass}
        rows={Math.min(Math.max(2, content.split('\n').length), 8)}
        aria-label={t('messages.editing.ariaInput')}
      />

      <div className={metaClass}>
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
        <p className={`text-xs font-medium ${isOwnMessage ? 'text-white/90' : 'text-[var(--color-error)]'}`} role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className={cancelClass}>
          {t('common.cancel')}
        </button>
        <button type="submit" disabled={saveDisabled} className={saveClass}>
          {localSaving || isSaving ? t('messages.editing.saving') : t('common.save')}
        </button>
      </div>
    </form>
  );
}
