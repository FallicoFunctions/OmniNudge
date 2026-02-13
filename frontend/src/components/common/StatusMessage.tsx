import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export type StatusVariant = 'loading' | 'error' | 'empty' | 'info';

type StatusMessageProps = {
  children?: ReactNode;
  className?: string;
  variant?: StatusVariant;
};

export function StatusMessage({ children, className = '', variant = 'info' }: StatusMessageProps) {
  const { t } = useTranslation();

  const defaultMessages: Record<StatusVariant, string> = {
    loading: t('common.loading'),
    error: t('common.unableToLoad'),
    empty: t('common.noResultsFound'),
    info: '',
  };

  const content = children ?? defaultMessages[variant];
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
