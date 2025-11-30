import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: ReactNode | string;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}

const EmptyState = ({ icon, title, description, action, secondaryAction }: EmptyStateProps) => {
  const defaultIcon = '📭';
  const displayIcon = typeof icon === 'string' ? icon : icon ?? defaultIcon;

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-12 text-center">
      <div className="text-6xl mb-4">{typeof displayIcon === 'string' ? displayIcon : displayIcon}</div>

      <h3 className="text-xl font-bold text-[var(--color-text-primary)]">{title}</h3>

      {description && (
        <p className="mt-2 max-w-md text-sm text-[var(--color-text-secondary)]">{description}</p>
      )}

      {(action || secondaryAction) && (
        <div className="mt-6 flex flex-wrap gap-3">
          {action && (
            <button
              type="button"
              className="rounded-lg bg-[var(--color-primary)] px-6 py-2 text-sm font-semibold text-white hover:opacity-90 transition"
              onClick={action.onClick}
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              className="rounded-lg border border-[var(--color-border)] px-6 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] transition"
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default EmptyState;
