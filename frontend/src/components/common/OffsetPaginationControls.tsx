import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

type OffsetPaginationControlsProps = {
  hasPrev: boolean;
  hasMore: boolean;
  isFetching?: boolean;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
  showDivider?: boolean;
  centerContent?: ReactNode;
};

export function OffsetPaginationControls({
  hasPrev,
  hasMore,
  isFetching = false,
  onPrev,
  onNext,
  className = '',
  showDivider = true,
  centerContent,
}: OffsetPaginationControlsProps) {
  const { t } = useTranslation();

  if (!hasPrev && !hasMore) {
    return null;
  }

  const dividerClasses = showDivider ? 'mt-6 border-t border-[var(--color-border)] pt-4' : '';

  return (
    <div className={`flex items-center justify-between ${dividerClasses} ${className}`}>
      <button
        type="button"
        onClick={onPrev}
        disabled={!hasPrev || isFetching}
        className="rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t('pagination.previous')}
      </button>
      {centerContent}
      <button
        type="button"
        onClick={onNext}
        disabled={!hasMore || isFetching}
        className="rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t('pagination.next')}
      </button>
    </div>
  );
}
