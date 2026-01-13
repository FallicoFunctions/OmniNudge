import React from 'react';

interface ModalHeaderProps {
  title: string;
  onClose: () => void;
  subtitle?: string;
}

export const ModalHeader: React.FC<ModalHeaderProps> = ({ title, onClose, subtitle }) => {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {subtitle}
          </p>
        )}
      </div>
      <button
        onClick={onClose}
        className="ml-4 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors flex-shrink-0"
        aria-label="Close modal"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};
