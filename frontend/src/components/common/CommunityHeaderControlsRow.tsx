import type { ReactNode } from 'react';

interface CommunityHeaderControlsRowProps {
  left?: ReactNode;
  right?: ReactNode;
}

export function CommunityHeaderControlsRow({ left, right }: CommunityHeaderControlsRowProps) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 pb-2">
      <div className="flex flex-wrap items-center gap-2">{left}</div>
      {right && (
        <div className="flex w-full flex-wrap items-center justify-end gap-3 md:w-auto">
          {right}
        </div>
      )}
    </div>
  );
}
