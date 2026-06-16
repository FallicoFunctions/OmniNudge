import { AlertCircle } from 'lucide-react';

interface InlineErrorProps {
  message: string;
  className?: string;
}

// Inline error for form fields
export function InlineError({ message, className = '' }: InlineErrorProps) {
  return (
    <div
      className={`flex items-start gap-2 text-sm text-red-600 dark:text-red-400 mt-1 ${className}`}
      role="alert"
    >
      <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

// Error box for multiple errors or longer messages
export function ErrorBox({
  title = 'Error',
  errors,
  className = '',
}: {
  title?: string;
  errors: string | string[];
  className?: string;
}) {
  const errorList = Array.isArray(errors) ? errors : [errors];

  return (
    <div
      className={`bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 ${className}`}
      role="alert"
    >
      <div className="flex gap-3">
        <AlertCircle size={20} className="flex-shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-sm text-red-800 dark:text-red-200 mb-1">{title}</h3>
          {errorList.length === 1 ? (
            <p className="text-sm text-red-700 dark:text-red-300">{errorList[0]}</p>
          ) : (
            <ul className="text-sm text-red-700 dark:text-red-300 list-disc list-inside space-y-1">
              {errorList.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// Field wrapper with error state
export function FormField({
  label,
  error,
  required,
  helperText,
  children,
  className = '',
}: {
  label?: string;
  error?: string;
  required?: boolean;
  helperText?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-semibold mb-2">
          {label}
          {required && <span className="text-red-600 ml-1">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <InlineError message={error} />
      ) : helperText ? (
        <p className="text-sm text-secondary mt-1">{helperText}</p>
      ) : null}
    </div>
  );
}
