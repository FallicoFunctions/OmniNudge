import { useTranslation } from 'react-i18next';
import { BottomSheet } from './BottomSheet';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

/**
 * Confirmation modal for mobile
 * Replaces window.confirm() with a styled bottom sheet
 * Features:
 * - Consistent design with app
 * - Danger variant for destructive actions
 * - Customizable button text
 * - Non-blocking (unlike window.confirm)
 */
export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  danger = false
}: ConfirmModalProps) {
  const { t } = useTranslation();

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={title}>
      <div className="px-4 py-4">
        {/* Message */}
        <p className="text-base text-[var(--color-text-primary)] mb-6">
          {message}
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          {/* Cancel */}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-3 text-base font-semibold text-[var(--color-text-primary)] bg-[var(--color-surface-secondary)] rounded-lg active:bg-[var(--color-hover)] transition-colors"
          >
            {cancelText || t('common.cancel')}
          </button>

          {/* Confirm */}
          <button
            type="button"
            onClick={handleConfirm}
            className={`flex-1 px-4 py-3 text-base font-semibold rounded-lg active:opacity-80 transition-opacity ${
              danger
                ? 'text-white bg-red-500'
                : 'text-white bg-[var(--color-primary)]'
            }`}
          >
            {confirmText || t('common.confirm')}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
