import React from 'react';
import { useTranslation } from 'react-i18next';

export type AlertVariant = 'error' | 'success' | 'warning' | 'info';

interface AlertProps {
  variant: AlertVariant;
  children: React.ReactNode;
  className?: string;
  onClose?: () => void;
}

export const Alert: React.FC<AlertProps> = ({ variant, children, className = '', onClose }) => {
  const { t } = useTranslation();

  const variantStyles: Record<AlertVariant, string> = {
    error: 'border-red-200 bg-red-50 text-red-900',
    success: 'border-green-200 bg-green-50 text-green-900',
    warning: 'border-yellow-200 bg-yellow-50 text-yellow-800',
    info: 'border-blue-200 bg-blue-50 text-blue-900',
  };

  const iconMap: Record<AlertVariant, string> = {
    error: '⚠️',
    success: '✓',
    warning: '⚠',
    info: 'ℹ',
  };

  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${variantStyles[variant]} ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-2">
          <span className="flex-shrink-0">{iconMap[variant]}</span>
          <div className="flex-1">{children}</div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-3 flex-shrink-0 text-current opacity-50 hover:opacity-100 transition-opacity"
            aria-label={t('common.close')}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
};
