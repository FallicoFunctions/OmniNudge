interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  className?: string;
}

const LoadingSpinner = ({ size = 'md', message, className = '' }: LoadingSpinnerProps) => {
  const sizeMap = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-2',
    lg: 'h-12 w-12 border-3',
  };

  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <div
        className={`${sizeMap[size]} animate-spin rounded-full border-[var(--color-border)] border-t-[var(--color-primary)]`}
        role="status"
        aria-label="Loading"
      />
      {message && (
        <p className="text-sm font-medium text-[var(--color-text-secondary)]">{message}</p>
      )}

      <style>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default LoadingSpinner;
