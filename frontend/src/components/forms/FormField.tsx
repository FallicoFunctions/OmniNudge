import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// FORM-2 & FORM-3: Standard form field component with consistent styling
interface FormFieldProps {
  label: string;
  required?: boolean;
  children: ReactNode;
  error?: string;
  helperText?: string;
  className?: string;
}

export function FormField({
  label,
  required = true,
  children,
  error,
  helperText,
  className = '',
}: FormFieldProps) {
  const { t } = useTranslation();

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Label: 14px (text-sm), semibold (font-semibold) */}
      <label className="block text-sm font-semibold text-[var(--color-text-primary)]">
        {label}
        {required ? (
          <span className="text-red-500 ml-1">*</span>
        ) : (
          <span className="text-[var(--color-text-secondary)] font-normal ml-1">
            {t('common.optional')}
          </span>
        )}
      </label>

      {/* Input field (passed as children) */}
      {children}

      {/* Error text: 12px (text-xs), red, replaces helper when present */}
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-[var(--color-text-secondary)]">{helperText}</p>
      ) : null}
    </div>
  );
}
