import React from 'react';
import { useTranslation } from 'react-i18next';

interface ModalCloseButtonProps {
  onClose: () => void;
}

/**
 * MODAL-3: Standard modal close button
 * - Absolutely positioned in top-right corner (24px from edges)
 * - 40x40px hitbox
 * - Hover state
 * - Works with ESC key (handled by Modal component)
 */
export const ModalCloseButton: React.FC<ModalCloseButtonProps> = ({ onClose }) => {
  const { t } = useTranslation();

  return (
    <button
      onClick={onClose}
      className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)]"
      aria-label={t('common.accessibility.closeModal')}
      title={t('common.accessibility.closeEsc')}
    >
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
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
  );
};
