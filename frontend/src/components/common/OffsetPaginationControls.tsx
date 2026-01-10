type OffsetPaginationControlsProps = {
  hasPrev: boolean;
  hasMore: boolean;
  isFetching?: boolean;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
};

export function OffsetPaginationControls({
  hasPrev,
  hasMore,
  isFetching = false,
  onPrev,
  onNext,
  className = '',
}: OffsetPaginationControlsProps) {
  if (!hasPrev && !hasMore) {
    return null;
  }

  return (
    <div
      className={`mt-6 flex items-center justify-between border-t border-[var(--color-border)] pt-4 ${className}`}
    >
      <button
        type="button"
        onClick={onPrev}
        disabled={!hasPrev || isFetching}
        className="rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        ← Previous
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!hasMore || isFetching}
        className="rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        Next →
      </button>
    </div>
  );
}
