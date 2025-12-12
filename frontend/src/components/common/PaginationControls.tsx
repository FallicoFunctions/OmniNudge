type PaginationControlsProps = {
  pageIndex: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
  className?: string;
};

export function PaginationControls({
  pageIndex,
  totalPages,
  onPrev,
  onNext,
  canGoPrev,
  canGoNext,
  className = '',
}: PaginationControlsProps) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div
      className={`mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4 ${className}`}
    >
      <button
        type="button"
        onClick={onPrev}
        disabled={!canGoPrev}
        className="rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        ← Previous
      </button>
      <span className="text-sm text-[var(--color-text-secondary)]">
        Page {pageIndex + 1} of {totalPages}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={!canGoNext}
        className="rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next →
      </button>
    </div>
  );
}
