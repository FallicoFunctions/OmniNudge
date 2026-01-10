import type { ReactNode } from 'react';

export type StatusVariant = 'loading' | 'error' | 'empty' | 'info';

type StatusMessageProps = {
  children?: ReactNode;
  className?: string;
  variant?: StatusVariant;
};

const DEFAULT_MESSAGES: Record<StatusVariant, string> = {
  loading: 'Loading...',
  error: 'Unable to load.',
  empty: 'No results found.',
  info: '',
};

export function StatusMessage({ children, className = '', variant = 'info' }: StatusMessageProps) {
  const content = children ?? DEFAULT_MESSAGES[variant];
  if (!content) return null;
  return (
    <p className={`mt-3 text-sm text-[var(--color-text-secondary)] ${className}`}>{content}</p>
  );
}

export function LoadingMessage({ children, className = '' }: Omit<StatusMessageProps, 'variant'>) {
  return (
    <StatusMessage variant="loading" className={className}>
      {children}
    </StatusMessage>
  );
}

export function ErrorMessage({ children, className = '' }: Omit<StatusMessageProps, 'variant'>) {
  return (
    <StatusMessage variant="error" className={className}>
      {children}
    </StatusMessage>
  );
}

export function EmptyMessage({ children, className = '' }: Omit<StatusMessageProps, 'variant'>) {
  return (
    <StatusMessage variant="empty" className={className}>
      {children}
    </StatusMessage>
  );
}
