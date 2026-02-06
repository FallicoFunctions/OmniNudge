import React from 'react';

interface ModalHeaderProps {
  title: string;
  onClose: () => void;
  subtitle?: string;
}

// MODAL-3: Standard modal header with absolutely positioned close button
export const ModalHeader: React.FC<ModalHeaderProps> = ({ title, onClose, subtitle }) => {
  return (
    <div className="mb-6">
      <div className="pr-12">
        <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {subtitle}
          </p>
        )}
      </div>
      {/* Close button - absolute positioned top-right corner */}
      <button
        onClick={onClose}
        className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)]"
        aria-label="Close modal"
        title="Close (Esc)"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};
