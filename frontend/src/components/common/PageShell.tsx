import type { ReactNode } from 'react';

type PageShellProps = {
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  withPanel?: boolean;
};

export function PageShell({
  children,
  className = '',
  panelClassName = '',
  withPanel = true,
}: PageShellProps) {
  return (
    <div className={`mx-auto w-full max-w-4xl px-4 py-10 ${className}`}>
      {withPanel ? (
        <div
          className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm ${panelClassName}`}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
