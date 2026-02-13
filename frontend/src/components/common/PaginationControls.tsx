import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

type PaginationControlsProps = {
  pageIndex: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
  className?: string;
  showDivider?: boolean;
  centerContent?: ReactNode;
};

export function PaginationControls({
  pageIndex,
  totalPages,
  onPrev,
  onNext,
  canGoPrev,
  canGoNext,
  className = '',
  showDivider = true,
  centerContent,
}: PaginationControlsProps) {
  const { t } = useTranslation();

  if (totalPages <= 1) {
    return null;
  }

  const dividerClasses = showDivider ? 'mt-4 border-t border-[var(--color-border)] pt-4' : '';

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 ${dividerClasses} ${className}`}
    >
      <button
        type="button"
        onClick={onPrev}
        disabled={!canGoPrev}
        className="rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t('pagination.previous')}
      </button>
      {centerContent ?? (
        <span className="text-sm text-[var(--color-text-secondary)]">
          {t('pagination.pageOf', { current: pageIndex + 1, total: totalPages })}
        </span>
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={!canGoNext}
        className="rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t('pagination.next')}
      </button>
    </div>
  );
}
