/**
 * Standardized error state components for consistent UX across the app
 * Includes: Field errors, form errors, page errors, inline errors
 */

import { useTranslation } from 'react-i18next';

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
