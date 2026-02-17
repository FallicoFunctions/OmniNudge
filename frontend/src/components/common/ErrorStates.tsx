/**
 * Standardized error state components for consistent UX across the app
 * Includes: Field errors, form errors, page errors, inline errors
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState as DesignEmptyState } from '../empty';

// Field Error - For individual form field validation
interface FieldErrorProps {
  message: string;
  id?: string;
}

export function FieldError({ message, id }: FieldErrorProps) {
  return (
    <p id={id} className="mt-1 text-sm text-red-600" role="alert">
      {message}
    </p>
  );
}

// Form Error - For form-level errors (submission failures)
interface FormErrorProps {
  title?: string;
  message: string;
  details?: string;
  onDismiss?: () => void;
}

export function FormError({ title, message, details, onDismiss }: FormErrorProps) {
  const { t } = useTranslation();

  return (
    <div
      className="rounded-lg border border-red-200 bg-red-50 p-4"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3">
        {/* Error icon */}
        <svg
          className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>

        {/* Error content */}
        <div className="flex-1">
          {title && <h3 className="text-sm font-semibold text-red-800 mb-1">{title}</h3>}
          <p className="text-sm text-red-700">{message}</p>
          {details && <p className="mt-2 text-xs text-red-600">{details}</p>}
        </div>

        {/* Dismiss button */}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="flex-shrink-0 text-red-600 hover:text-red-800"
            aria-label={t('common.close')}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// Page Error - For page-level errors (API failures, network errors)
interface PageErrorProps {
  title?: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  fullPage?: boolean;
}

export function PageError({ title, message, action, fullPage = false }: PageErrorProps) {
  const { t } = useTranslation();
  const containerClasses = fullPage ? 'min-h-screen flex items-center justify-center p-6' : 'p-6';
  const resolvedTitle = title ?? t('errors.somethingWentWrong');

  return (
    <div className={containerClasses}>
      <div className="max-w-md mx-auto text-center">
        {/* Error icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
          <svg
            className="w-8 h-8 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        {/* Error text */}
        <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">
          {resolvedTitle}
        </h2>
        <p className="text-[var(--color-text-secondary)] mb-6">{message}</p>

        {/* Action button */}
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="rounded-lg bg-[var(--color-primary)] px-6 py-2 text-white font-medium hover:bg-[var(--color-primary-dark)] transition"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

// Inline Error - Small inline errors for non-form contexts
interface InlineErrorProps {
  message: string;
  className?: string;
}

export function InlineError({ message, className = '' }: InlineErrorProps) {
  return (
    <div className={`flex items-center gap-2 text-sm text-red-600 ${className}`} role="alert">
      <svg
        className="w-4 h-4 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span>{message}</span>
    </div>
  );
}

// Network Error - Specific for network/API failures with retry
interface NetworkErrorProps {
  message?: string;
  onRetry?: () => void;
}

export function NetworkError({ message, onRetry }: NetworkErrorProps) {
  const { t } = useTranslation();
  const resolvedMessage = message ?? t('errors.networkError');

  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
      <div className="flex items-start gap-3">
        {/* Warning icon */}
        <svg
          className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>

        <div className="flex-1">
          <p className="text-sm text-orange-800">{resolvedMessage}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 text-sm font-medium text-orange-700 hover:text-orange-900 underline"
            >
              {t('emptyStates.error.actions.tryAgain')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Empty State Error - When no data is found (not technically an error, but similar pattern)
interface EmptyStateProps {
  title: string;
  message: string;
  icon?: ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ title, message, icon, action }: EmptyStateProps) {
  return (
    <DesignEmptyState
      iconNode={icon}
      illustration={icon ? undefined : 'noData'}
      title={title}
      description={message}
      action={action}
      className="py-6"
    />
  );
}

// Success State - For consistency with error patterns
interface SuccessStateProps {
  message: string;
  onDismiss?: () => void;
}

export function SuccessState({ message, onDismiss }: SuccessStateProps) {
  const { t } = useTranslation();

  return (
    <div
      className="rounded-lg border border-green-200 bg-green-50 p-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        {/* Success icon */}
        <svg
          className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>

        {/* Success message */}
        <p className="flex-1 text-sm text-green-800">{message}</p>

        {/* Dismiss button */}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="flex-shrink-0 text-green-600 hover:text-green-800"
            aria-label={t('common.close')}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
