import { useTranslation } from 'react-i18next';

interface ReplyIndicatorProps {
  parentUsername?: string;
  parentPreview?: string;
  deleted?: boolean;
  onJumpToOriginal?: () => void;
}

export function ReplyIndicator({
  parentUsername,
  parentPreview,
  deleted = false,
  onJumpToOriginal,
}: ReplyIndicatorProps) {
  const { t } = useTranslation();

  const previewText = deleted
    ? t('messages.replyIndicator.deleted')
    : parentPreview?.trim() || t('messages.replyIndicator.originalMessage');

  const usernameText = deleted
    ? t('messages.replyIndicator.unknownUser')
    : parentUsername?.trim() || t('messages.replyIndicator.unknownUser');

  return (
    <button
      type="button"
      onClick={onJumpToOriginal}
      disabled={!onJumpToOriginal}
      className="mb-1 inline-flex max-w-full items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-left text-[11px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)] disabled:cursor-default disabled:opacity-80"
      aria-label={t('messages.replyIndicator.openOriginalAria')}
    >
      <span aria-hidden="true">↪</span>
      <span className="truncate">
        {t('messages.replyIndicator.replyingTo', { username: usernameText })}
      </span>
      <span className="truncate text-[var(--color-text-muted)]">"{previewText}"</span>
    </button>
  );
}
