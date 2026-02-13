import { AlertCircle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ErrorModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  details?: string;
  onClose: () => void;
  onRetry?: () => void;
  actionLabel?: string;
}

export function ErrorModal({
  isOpen,
  title,
  message,
  details,
  onClose,
  onRetry,
  actionLabel,
}: ErrorModalProps) {
  const { t } = useTranslation();
  const actionLabelText = actionLabel ?? t('emptyStates.error.actions.tryAgain');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg max-w-md w-full p-6 relative shadow-xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-secondary hover:text-primary"
          aria-label={t('common.close')}
        >
          <X size={20} />
        </button>

        <div className="flex gap-4 mb-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
            <AlertCircle size={24} className="text-red-600 dark:text-red-400" />
          </div>

          <div className="flex-1">
            <h2 className="text-xl font-bold mb-2">{title}</h2>
            <p className="text-secondary">{message}</p>
          </div>
        </div>

        {details && (
          <div className="bg-secondary/10 rounded p-3 mb-4">
            <p className="text-sm text-secondary font-mono">{details}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-border rounded hover:bg-secondary/10"
          >
            {t('common.close')}
          </button>
          {onRetry && (
            <button
              onClick={() => {
                onRetry();
                onClose();
              }}
              className="flex-1 px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
            >
              {actionLabelText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Confirmation dialog for destructive actions
export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const confirmLabelText = confirmLabel ?? t('common.confirm');
  const cancelLabelText = cancelLabel ?? t('common.cancel');

  const variantStyles = {
    danger: 'bg-red-600 hover:bg-red-700',
    warning: 'bg-yellow-600 hover:bg-yellow-700',
    primary: 'bg-primary hover:bg-primary-dark',
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg max-w-md w-full p-6 shadow-xl">
        <h2 className="text-xl font-bold mb-2">{title}</h2>
        <p className="text-secondary mb-6">{message}</p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-border rounded hover:bg-secondary/10"
          >
            {cancelLabelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2 text-white rounded ${variantStyles[variant]}`}
          >
            {confirmLabelText}
          </button>
        </div>
      </div>
    </div>
  );
}
