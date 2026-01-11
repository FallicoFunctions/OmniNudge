export function SkeletonCard() {
  return (
    <div className="mb-4 animate-pulse rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      {/* Header - user info */}
      <div className="mb-3 flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-[var(--color-border)]" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-32 rounded bg-[var(--color-border)]" />
          <div className="h-3 w-24 rounded bg-[var(--color-border)]" />
        </div>
      </div>

      {/* Title */}
      <div className="mb-2 space-y-2">
        <div className="h-4 w-3/4 rounded bg-[var(--color-border)]" />
        <div className="h-4 w-1/2 rounded bg-[var(--color-border)]" />
      </div>

      {/* Content preview */}
      <div className="mb-3 space-y-2">
        <div className="h-3 w-full rounded bg-[var(--color-border)]" />
        <div className="h-3 w-5/6 rounded bg-[var(--color-border)]" />
        <div className="h-3 w-4/6 rounded bg-[var(--color-border)]" />
      </div>

      {/* Footer - actions */}
      <div className="flex items-center gap-4">
        <div className="h-8 w-20 rounded bg-[var(--color-border)]" />
        <div className="h-8 w-20 rounded bg-[var(--color-border)]" />
        <div className="h-8 w-20 rounded bg-[var(--color-border)]" />
      </div>
    </div>
  );
}

export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
