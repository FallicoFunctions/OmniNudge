interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

const sizeClasses = {
  small: 'w-4 h-4 border-2',
  medium: 'w-8 h-8 border-2',
  large: 'w-12 h-12 border-3',
};

export function LoadingSpinner({ size = 'medium', className = '' }: LoadingSpinnerProps) {
  return (
    <div
      className={`inline-block animate-spin rounded-full border-primary border-t-transparent ${sizeClasses[size]} ${className}`}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}

// Centered spinner for full page/container loading
export function LoadingSpinnerCentered({ size = 'large' }: LoadingSpinnerProps) {
  return (
    <div className="flex items-center justify-center min-h-[200px] w-full">
      <LoadingSpinner size={size} />
    </div>
  );
}
