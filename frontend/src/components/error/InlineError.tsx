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
