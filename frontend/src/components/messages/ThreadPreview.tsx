import { useTranslation } from 'react-i18next';

interface ThreadPreviewProps {
  replyCount: number;
  onOpenThread?: () => void;
}

export function ThreadPreview({ replyCount, onOpenThread }: ThreadPreviewProps) {
  const { t } = useTranslation();

  if (replyCount <= 0) return null;

  const content = (
    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
      <span>{t('messages.threadPreview.replyCount', { count: replyCount })}</span>
      {onOpenThread && (
        <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
          {t('messages.threadPreview.viewThread')}
        </span>
      )}
    </span>
  );

  if (!onOpenThread) {
    return <div className="mt-1">{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onOpenThread}
      className="mt-1 inline-flex items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
      aria-label={t('messages.threadPreview.openAria')}
    >
      {content}
    </button>
  );
}
